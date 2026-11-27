import { strict as assert } from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { feedbackFormConfig, submitFeedback } from '../feedback/form.mjs';
import { FEEDBACK_PATH, ISSUE_MARKER, ISSUE_TITLE, TURNSTILE_ACTION } from '../feedback/protocol.mjs';
import {
  FeedbackRateLimiter, LIMITER_OBJECT_NAME, MAX_PER_CLIENT, MAX_TOTAL, RESERVE_URL, TOKEN_RETENTION_MS, WINDOW_MS,
} from '../feedback/rate-limiter.mjs';
import worker from '../feedback/worker.mjs';

const origin = 'https://atlas.example.test';
const siteverify = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const github = 'https://api.github.com/repos/example/atlas/issues';
const fields = { feedback: '请核对图层', turnstileToken: 'fixture-challenge' };
const config = {
  FEEDBACK_ENABLED: 'true',
  FEEDBACK_ORIGIN: origin,
  FEEDBACK_GITHUB_REPO: 'example/atlas',
  TURNSTILE_SECRET_KEY: 'fixture',
  GITHUB_ISSUE_TOKEN: 'fixture',
  FEEDBACK_RATE_KEY: 'ab'.repeat(32),
};
const verified = { success: true, hostname: 'atlas.example.test', action: TURNSTILE_ACTION };

function request({ url = `${origin}${FEEDBACK_PATH}`, method = 'POST', headers = {}, body = JSON.stringify(fields) } = {}) {
  const combined = new Headers({
    Origin: origin,
    'Sec-Fetch-Site': 'same-origin',
    'CF-Connecting-IP': '192.0.2.1',
    'Content-Type': 'application/json',
  });
  for (const [name, value] of Object.entries(headers)) {
    if (value === null) combined.delete(name);
    else combined.set(name, value);
  }
  return new Request(url, { method, headers: combined, body: method === 'POST' ? body : undefined, duplex: 'half' });
}

function environment(reserve) {
  return {
    ...config,
    FEEDBACK_RATE_LIMITER: {
      idFromName: name => name,
      get: name => ({ fetch: (url, options) => reserve(name, new Request(url, options)) }),
    },
  };
}

test('默认停用，且只接受站点原点的表单 POST', async context => {
  const upstream = context.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected network'); });
  const reserve = context.mock.fn(async () => new Response(null, { status: 204 }));
  const env = environment(reserve);
  for (const key of [
    'FEEDBACK_ENABLED', 'FEEDBACK_ORIGIN', 'FEEDBACK_GITHUB_REPO', 'TURNSTILE_SECRET_KEY',
    'GITHUB_ISSUE_TOKEN', 'FEEDBACK_RATE_KEY', 'FEEDBACK_RATE_LIMITER',
  ]) {
    assert.equal((await worker.fetch(request(), { ...env, [key]: undefined })).status, 503, key);
  }
  assert.equal((await worker.fetch(request(), { ...env, FEEDBACK_GITHUB_REPO: 'example/..' })).status, 503);
  for (const [input, status] of [
    [request({ url: 'https://other.example.test/api/feedback' }), 403],
    [request({ headers: { Origin: null } }), 403],
    [request({ headers: { Origin: 'https://atlas.example.test.evil.test' } }), 403],
    [request({ headers: { 'Sec-Fetch-Site': 'same-site' } }), 403],
    [request({ method: 'OPTIONS', headers: { Origin: 'https://foreign.example.test' } }), 403],
    [request({ method: 'GET' }), 405],
    [request({ url: `${origin}/api/other` }), 404],
    [request({ headers: { 'CF-Connecting-IP': null, 'X-Forwarded-For': '192.0.2.1' } }), 503],
  ]) {
    const response = await worker.fetch(input, env);
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  assert.equal(reserve.mock.callCount(), 0);
  assert.equal(upstream.mock.callCount(), 0);
});

test('请求体按字节限长，校验 JSON 类型、字段和 URL 协议', async context => {
  const reserve = context.mock.fn(async () => new Response(null, { status: 204 }));
  const env = environment(reserve);
  const oversized = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(8192));
      controller.enqueue(new Uint8Array(8193));
      controller.close();
    },
  });
  for (const [input, status] of [
    [request({ headers: { 'Content-Type': 'text/plain' } }), 415],
    [request({ headers: { 'Content-Type': 'application/json; charset=utf-16' } }), 415],
    [request({ headers: { 'Content-Encoding': 'gzip' } }), 415],
    [request({ headers: { 'Content-Length': '20000' } }), 413],
    [request({ headers: { 'Content-Length': '3' }, body: oversized }), 413],
    [request({ body: Uint8Array.from([0xff, 0xfe]) }), 400],
    [request({ body: JSON.stringify({ ...fields, feedback: '字'.repeat(2001) }) }), 400],
    [request({ body: JSON.stringify({ ...fields, turnstileToken: 'x'.repeat(2049) }) }), 400],
    [request({ body: JSON.stringify({ ...fields, repository: 'elsewhere/repo' }) }), 400],
    ...['//example.test/a', 'javascript:alert(1)', 'https://user@example.test/a', 'file:///path'].map(sourceUrl =>
      [request({ body: JSON.stringify({ ...fields, sourceUrl }) }), 400]),
  ]) {
    assert.equal((await worker.fetch(input, env)).status, status);
  }
  assert.equal(reserve.mock.callCount(), 0);
});

test('绑定和 Turnstile 通过后只在目标仓库创建字面文本 issue', async context => {
  const calls = [];
  const env = environment((name, internal) => {
    calls.push('reserve');
    assert.equal(name, LIMITER_OBJECT_NAME);
    assert.equal(internal.url, RESERVE_URL);
    assert.equal(internal.method, 'POST');
    assert.match(internal.headers.get('X-Feedback-Client-Hash'), /^[a-f0-9]{64}$/);
    assert.match(internal.headers.get('X-Feedback-Token-Hash'), /^[a-f0-9]{64}$/);
    return new Response(null, { status: 204 });
  });
  const upstream = context.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url);
    if (url === siteverify) return Response.json(verified);
    return Response.json({ html_url: 'private-issue-reference' }, { status: 201 });
  });
  const feedback = '# 标题\r\n@maintainer\r\n```\r\n![图片](https://example.test/img)\u202e';
  const sourceUrl = 'https://EXAMPLE.test/data?q=5#source';
  const response = await worker.fetch(request({
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ ...fields, feedback, sourceUrl }),
  }), env);

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(calls, ['reserve', siteverify, github]);
  const [, verification] = upstream.mock.calls[0].arguments;
  assert.equal(verification.method, 'POST');
  assert.equal(verification.redirect, 'manual');
  assert.equal(verification.body.has('remoteip'), false);
  assert.ok(verification.body.get('secret') === config.TURNSTILE_SECRET_KEY);
  assert.ok(verification.body.get('response') === fields.turnstileToken);
  const [, write] = upstream.mock.calls[1].arguments;
  assert.equal(write.method, 'POST');
  assert.equal(write.redirect, 'manual');
  assert.ok(write.headers.Authorization === `Bearer ${config.GITHUB_ISSUE_TOKEN}`);
  assert.deepEqual(JSON.parse(write.body), {
    title: ISSUE_TITLE,
    body: `${ISSUE_MARKER}\n\n## 意见（未信任）\n\n` +
      '    # 标题\n    @maintainer\n    ```\n    ![图片](https://example.test/img)\\u202e\n\n' +
      '## 来源链接（未信任）\n\n    https://example.test/data?q=5#source\n',
  });
});

test('限流、令牌重放和依赖错误停止后续写入且隐藏上游细节', async context => {
  let verdict;
  let turnstileStatus = 200;
  let githubStatus = 201;
  const upstream = context.mock.method(globalThis, 'fetch', async url => {
    if (url === siteverify) {
      if (!verdict) throw new Error('private upstream detail');
      return Response.json(verdict, { status: turnstileStatus });
    }
    return new Response('internal detail', { status: githubStatus });
  });
  for (const [reserve, status] of [
    [() => { throw new Error('unavailable'); }, 503],
    [() => new Response(null, { status: 200 }), 503],
    [() => new Response(null, { status: 409 }), 403],
    [() => new Response(null, { status: 429 }), 429],
  ]) {
    const response = await worker.fetch(request(), environment(reserve));
    assert.equal(response.status, status);
    if (status === 429) assert.equal(response.headers.get('Retry-After'), '60');
  }
  assert.equal(upstream.mock.callCount(), 0);

  const env = environment(() => new Response(null, { status: 204 }));
  for (const rejected of [
    undefined,
    { ...verified, success: false },
    { ...verified, hostname: 'another.example.test' },
    { ...verified, action: 'different_action' },
  ]) {
    verdict = rejected;
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, rejected ? 403 : 503);
  }
  verdict = verified;
  turnstileStatus = 302;
  assert.equal((await worker.fetch(request(), env)).status, 503);
  assert.deepEqual(upstream.mock.calls.map(call => call.arguments[0]), Array(5).fill(siteverify));
  turnstileStatus = 200;
  githubStatus = 302;
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, code: 'unavailable' });
  assert.equal(upstream.mock.calls.filter(call => call.arguments[0] === github).length, 1);
});

function sqliteStorage(database) {
  let alarm = null;
  return {
    sql: {
      exec(query, ...bindings) {
        const rows = database.prepare(query).all(...bindings);
        return { one: () => rows[0], toArray: () => rows };
      },
    },
    transactionSync(callback) {
      database.exec('BEGIN IMMEDIATE');
      try {
        const result = callback();
        database.exec('COMMIT');
        return result;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
    getAlarm: async () => alarm,
    async setAlarm(time) { alarm = time; },
  };
}

function reservation(client, token) {
  return new Request(RESERVE_URL, {
    method: 'POST',
    headers: {
      'X-Feedback-Client-Hash': client.toString(16).padStart(64, '0'),
      'X-Feedback-Token-Hash': token.toString(16).padStart(64, '0'),
    },
  });
}

test('SQLite 事务对并发、实例重建和滚动窗口维持同一配额', async context => {
  const database = new DatabaseSync(':memory:');
  context.after(() => database.close());
  const storage = sqliteStorage(database);
  const start = 900_000;
  let now = start;
  context.mock.method(Date, 'now', () => now);
  const limiter = new FeedbackRateLimiter({ storage });
  const statuses = async requests => (await Promise.all(requests.map(input => limiter.fetch(input))))
    .map(response => response.status);

  assert.deepEqual((await statuses([reservation(1, 1), reservation(2, 1)])).sort(), [204, 409]);
  const sameClient = await statuses(Array.from({ length: MAX_PER_CLIENT + 1 }, (_, index) => reservation(3, index + 2)));
  assert.equal(sameClient.filter(status => status === 204).length, MAX_PER_CLIENT);
  assert.equal(sameClient.filter(status => status === 429).length, 1);
  const distinctClients = await statuses(Array.from({ length: MAX_TOTAL }, (_, index) => reservation(index + 10, index + 10)));
  assert.equal(distinctClients.filter(status => status === 204).length, MAX_TOTAL - MAX_PER_CLIENT - 1);
  assert.equal(distinctClients.filter(status => status === 429).length, MAX_PER_CLIENT + 1);
  const restarted = new FeedbackRateLimiter({ storage });
  assert.equal((await restarted.fetch(reservation(101, 101))).status, 429);
  now += WINDOW_MS;
  assert.equal((await restarted.fetch(reservation(101, 101))).status, 204);
  assert.equal((await restarted.fetch(reservation(101, 1))).status, 409);
  now = start + TOKEN_RETENTION_MS;
  await restarted.alarm();
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM reservations').get().count, 1);
  assert.equal(await storage.getAlarm(), start + WINDOW_MS + TOKEN_RETENTION_MS);
  now += WINDOW_MS;
  await restarted.alarm();
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM reservations').get().count, 0);
});

test('表单适配器只发送协议字段到文档原点', async context => {
  const form = { ownerDocument: { location: { origin } } };
  context.mock.method(globalThis, 'FormData', function (input) {
    assert.equal(input, form);
    return new Map([['feedback', '图层建议'], ['cf-turnstile-response', 'fixture-challenge'], ['extra', 'ignore']]);
  });
  const fetch = context.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 201 }));
  assert.equal(feedbackFormConfig.action, TURNSTILE_ACTION);
  assert.equal((await submitFeedback(form)).status, 201);
  const [url, options] = fetch.mock.calls[0].arguments;
  assert.equal(url.href, `${origin}${FEEDBACK_PATH}`);
  assert.equal(options.method, 'POST');
  assert.equal(options.mode, 'same-origin');
  assert.equal(options.credentials, 'omit');
  assert.deepEqual(JSON.parse(options.body), { feedback: '图层建议', sourceUrl: '', turnstileToken: 'fixture-challenge' });
});
