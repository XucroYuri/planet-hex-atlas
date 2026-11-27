import test from 'node:test';
import assert from 'node:assert/strict';
import { createSphereGPU } from '../web/js/sphere-gpu.js';

test('GPU initialization falls back cleanly if WebGL2 is unavailable or denied', () => {
  const previous = globalThis.document;
  try {
    globalThis.document = {createElement:()=>({getContext:()=>null})};
    assert.equal(createSphereGPU(()=>{}),null);
    globalThis.document = {createElement:()=>({getContext:()=>{throw Error('unavailable')}})};
    assert.equal(createSphereGPU(()=>{}),null);
  } finally { globalThis.document=previous; }
});
