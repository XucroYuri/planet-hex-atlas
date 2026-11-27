import {
  FEEDBACK_PATH, GITHUB_API_VERSION, ISSUE_MARKER, ISSUE_TITLE, MAX_FEEDBACK_LENGTH,
  MAX_SOURCE_LENGTH, MAX_TOKEN_LENGTH, TURNSTILE_ACTION, isRepository, literalMarkdown,
} from './protocol.mjs';
import { LIMITER_OBJECT_NAME, RESERVE_URL, WINDOW_MS } from './rate-limiter.mjs';

export { FeedbackRateLimiter } from './rate-limiter.mjs';

const MAX_BODY_BYTES = 16_384;
const UPSTREAM_TIMEOUT_MS = 5000;
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const JSON_UTF8 = /^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i;
const PRINTABLE_ASCII = /^[\x21-\x7e]+$/;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const FIELDS = new Set(['feedback', 'sourceUrl', 'turnstileToken']);
const encoder = new TextEncoder();

function json(status, code, headers = {}) {
  return Response.json(code ? { ok: false, code } : { ok: true }, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

function readConfig(env) {
  if (env.FEEDBACK_ENABLED !== 'true' || !isRepository(env.FEEDBACK_GITHUB_REPO)) return null;
  const { TURNSTILE_SECRET_KEY: turnstile, GITHUB_ISSUE_TOKEN: github, FEEDBACK_RATE_KEY: rateKey } = env;
  if (![turnstile, github].every(secret => typeof secret === 'string' &&
    secret.length <= 512 && PRINTABLE_ASCII.test(secret))) return null;
  if (typeof rateKey !== 'string' || !/^[a-f0-9]{64}$/i.test(rateKey)) return null;
  const limiter = env.FEEDBACK_RATE_LIMITER;
  if (typeof limiter?.idFromName !== 'function' || typeof limiter?.get !== 'function') return null;
  try {
    const origin = new URL(env.FEEDBACK_ORIGIN);
    if (origin.protocol !== 'https:' || origin.origin !== env.FEEDBACK_ORIGIN) return null;
    return { origin, repo: env.FEEDBACK_GITHUB_REPO, turnstile, github, rateKey, limiter };
  } catch {
    return null;
  }
}

async function readJson(request) {
  const contentType = request.headers.get('Content-Type') ?? '';
  const contentEncoding = request.headers.get('Content-Encoding');
  if (!JSON_UTF8.test(contentType) || (contentEncoding !== null && contentEncoding.toLowerCase() !== 'identity')) {
    return { error: json(415, 'unsupported_media_type') };
  }
  const contentLength = request.headers.get('Content-Length');
  if (contentLength !== null && !/^\d+$/.test(contentLength)) {
    return { error: json(400, 'invalid_body') };
  }
  if (Number(contentLength) > MAX_BODY_BYTES) {
    return { error: json(413, 'body_too_large') };
  }
  if (!request.body) return { error: json(400, 'invalid_body') };

  const buffer = new Uint8Array(MAX_BODY_BYTES);
  const reader = request.body.getReader();
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (bytes + value.byteLength > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        return { error: json(413, 'body_too_large') };
      }
      buffer.set(value, bytes);
      bytes += value.byteLength;
    }
    return { data: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytes))) };
  } catch {
    return { error: json(400, 'invalid_body') };
  } finally {
    reader.releaseLock();
  }
}

function readSourceUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_SOURCE_LENGTH) return null;
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed) || /[\s\\\p{Cc}]/u.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (!url.hostname || url.username || url.password || url.href.length > MAX_SOURCE_LENGTH) return null;
    return url.href;
  } catch {
    return null;
  }
}

function readFields(data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data) ||
      Object.keys(data).some(field => !FIELDS.has(field))) return null;
  const { feedback, turnstileToken, sourceUrl = '' } = data;
  if (typeof feedback !== 'string' || feedback.length > MAX_FEEDBACK_LENGTH ||
      !feedback.trim() || CONTROL_CHARACTERS.test(feedback)) return null;
  if (typeof turnstileToken !== 'string' || turnstileToken.length > MAX_TOKEN_LENGTH ||
      !PRINTABLE_ASCII.test(turnstileToken)) return null;
  const source = readSourceUrl(sourceUrl);
  if (source === null) return null;
  return { feedback: feedback.trim(), turnstileToken, source };
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function reserve(config, ip, token) {
  const key = await crypto.subtle.importKey('raw',
    Uint8Array.from(config.rateKey.match(/../g), byte => Number.parseInt(byte, 16)),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const [clientHash, tokenHash] = await Promise.all([
    crypto.subtle.sign('HMAC', key, encoder.encode(ip)),
    crypto.subtle.digest('SHA-256', encoder.encode(token)),
  ]);
  const object = config.limiter.get(config.limiter.idFromName(LIMITER_OBJECT_NAME));
  const response = await object.fetch(RESERVE_URL, {
    method: 'POST',
    headers: {
      'X-Feedback-Client-Hash': toHex(clientHash),
      'X-Feedback-Token-Hash': toHex(tokenHash),
    },
  });
  return response.status;
}

async function verifyTurnstile(config, token) {
  const response = await fetch(SITEVERIFY_URL, {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    body: new URLSearchParams({ secret: config.turnstile, response: token }),
  });
  if (response.status !== 200) {
    await response.body?.cancel();
    throw new Error('Turnstile unavailable');
  }
  const verdict = await response.json();
  return verdict?.success === true && verdict.hostname === config.origin.hostname &&
    verdict.action === TURNSTILE_ACTION;
}

async function createIssue(config, { feedback, source }) {
  const sections = [ISSUE_MARKER, '## 意见（未信任）', literalMarkdown(feedback)];
  if (source) sections.push('## 来源链接（未信任）', literalMarkdown(source));
  const response = await fetch(`https://api.github.com/repos/${config.repo}/issues`, {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.github}`,
      'Content-Type': 'application/json',
      'User-Agent': 'planet-hex-atlas-feedback',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    },
    body: JSON.stringify({ title: ISSUE_TITLE, body: `${sections.join('\n\n')}\n` }),
  });
  await response.body?.cancel();
  return response.status === 201;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== FEEDBACK_PATH || url.search) return json(404, 'not_found');
    const config = readConfig(env);
    if (!config) return json(503, 'unavailable');
    const fetchSite = request.headers.get('Sec-Fetch-Site');
    if (url.origin !== config.origin.origin || request.headers.get('Origin') !== config.origin.origin ||
        (fetchSite !== null && fetchSite !== 'same-origin')) {
      return json(403, 'origin_denied');
    }
    if (request.method !== 'POST') return json(405, 'method_not_allowed', { Allow: 'POST' });
    const ip = request.headers.get('CF-Connecting-IP');
    if (ip === null || !/^[0-9a-f:.]{2,45}$/i.test(ip)) return json(503, 'unavailable');

    const { error, data } = await readJson(request);
    if (error) return error;
    const fields = readFields(data);
    if (!fields) return json(400, 'invalid_fields');
    try {
      const status = await reserve(config, ip, fields.turnstileToken);
      if (status === 409) return json(403, 'turnstile_rejected');
      if (status === 429) return json(429, 'rate_limited', { 'Retry-After': String(WINDOW_MS / 1000) });
      if (status !== 204) return json(503, 'unavailable');
      if (!await verifyTurnstile(config, fields.turnstileToken)) return json(403, 'turnstile_rejected');
      if (await createIssue(config, fields)) return json(201);
    } catch {
      return json(503, 'unavailable');
    }
    return json(503, 'unavailable');
  },
};
