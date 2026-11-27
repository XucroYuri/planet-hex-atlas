import test from 'node:test';
import assert from 'node:assert/strict';
import { createObservationStore } from '../web/js/observation-store.js';

test('deduplicates pending reads, retains zero and does not mix year data', async () => {
  let reads=0;
  const store=createObservationStore(async(name)=>{ reads++;await Promise.resolve();const year=Number(name.match(/(\d{4})/)[0]);return {year,regions:{AAA:{value:year===2000?0:year}}};},2000,2001);
  await Promise.all([store.ensureYear(2000),store.ensureYear(2000)]);
  assert.equal(reads,1);
  assert.equal(store.value('AAA','value',2000),0);
  assert.equal(store.value('AAA','value',2001),null);
  await store.ensureYear(2001);
  assert.equal(store.value('AAA','value',2001),2001);
  await assert.rejects(store.ensureYear(1999));
});

test('a failed year fetch can be retried and history becomes the authoritative store', async () => {
  let fail=true;
  const store=createObservationStore(async(name)=>{
    if (name==='observations.json') return {WLD:{pop:[12,14]}};
    if (fail) { fail=false;throw Error('temporary'); }
    return {year:2000,regions:{WLD:{pop:12}}};
  },2000,2001);
  await assert.rejects(store.ensureYear(2000));
  await store.ensureYear(2000);
  assert.equal(store.value('WLD','pop',2000),12);
  await store.ensureHistory();
  assert.equal(store.value('WLD','pop',2001),14);
});
