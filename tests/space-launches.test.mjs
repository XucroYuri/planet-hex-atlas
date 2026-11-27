import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const record = JSON.parse(await readFile(new URL('../web/data/space/launches.json', import.meta.url)));

test('launch series covers 1957-2025 with a pinned source', () => {
  assert.equal(record.schema, 1);
  assert.equal(record.years[0], 1957);
  assert.equal(record.years.at(-1), 2025);
  assert.equal(record.years.length, 69);
  assert.equal(record.world.length, 69);
  assert.match(record.source.sha256, /^[0-9a-f]{64}$/);
  assert.match(record.source.chart, /^https:\/\/ourworldindata\.org\//);
  assert.match(record.source.citation, /United Nations Office for Outer Space Affairs/);
});

test('world totals and anchors match the published series', () => {
  const world = new Map(record.world);
  assert.equal(world.get(1957), 2);
  assert.equal(world.get(2025), 4510);
  assert.deepEqual(record.totals.peak, { year: 2025, count: 4510 });
  assert.equal(record.totals.objects, 24865);
  assert.equal(record.totals.latest.year, 2025);
  assert.equal(new Map(record.countries.CHN.series).get(2025), 374);
  assert.equal(record.countries.CHN.name, 'China');
});

test('country registrations sum below the world total only by documented residuals', () => {
  for (const [year, difference] of Object.entries(record.totals.countrySumDiff)) {
    assert.ok(Number.isSafeInteger(difference), `${year} difference`);
    assert.ok(Math.abs(difference) <= 80, `${year} residual ${difference}`);
  }
});
