import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const record = JSON.parse(await readFile(new URL('../web/data/china-official.json', import.meta.url)));

test('official NBS GDP panel keeps currency, revision stage, scope and citable sources', () => {
  assert.equal(record.schema, 2);
  assert.equal(record.currency, 'CNY');
  assert.equal(record.unit, '亿元');
  assert.match(record.scope, /香港.*澳门.*台湾/);
  const expected = { 2023: 1294272, 2024: 1348066, 2025: 1401879 };
  for (const [year, gdp] of Object.entries(expected)) {
    const row = record.series[year];
    assert.equal(row.gdp, gdp, year);
    assert.match(row.url, /^https:\/\/www\.stats\.gov\.cn\/sj\/zxfb\//, year);
    assert.ok(row.published >= '2024-12-27', year);
    assert.ok(row.revision.length > 0, year);
  }
  assert.equal(record.series['2023'].revision, '第五次全国经济普查后修订数');
  assert.equal(record.series['2024'].revision, '最终核实');
  assert.equal(record.series['2025'].revision, '初步核算');
});
