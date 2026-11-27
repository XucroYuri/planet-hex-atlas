import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../web/js/data.js';

const original = globalThis.fetch;
const restore = () => { globalThis.fetch = original; };

function stub(responses) {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (!responses.length) throw new Error('unexpected fetch');
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body,
      arrayBuffer: async () => next.body,
    };
  };
  return calls;
}

test('load retries transient network failures and 5xx, then succeeds', async () => {
  const calls = stub([
    new TypeError('fetch failed'),
    { status: 503, body: null },
    { status: 200, body: { ok: true } },
  ]);
  try {
    assert.deepEqual(await load('atlas.json'), { ok: true });
    assert.equal(calls.length, 3);
  } finally { restore(); }
});

test('load does not retry 4xx or exhaust beyond three attempts', async () => {
  let calls = stub([{ status: 404, body: null }]);
  try {
    await assert.rejects(load('missing.json'), /HTTP 404/);
    assert.equal(calls.length, 1);
  } finally { restore(); }
  calls = stub([new TypeError('down'), new TypeError('down'), new TypeError('down'), { status: 200, body: {} }]);
  try {
    await assert.rejects(load('atlas.json'), /down/);
    assert.equal(calls.length, 3);
  } finally { restore(); }
});
