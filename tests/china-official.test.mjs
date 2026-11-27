import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const record = JSON.parse(await readFile(new URL('../web/data/china-official.json', import.meta.url)));
const notes = JSON.parse(await readFile(new URL('../web/data/missing-notes.json', import.meta.url)));

test('official NBS GDP series keeps units, price basis, scope and citable sources', () => {
  assert.equal(record.schema, 3);
  assert.equal(record.authority, '国家统计局');
  assert.equal(record.unit, '亿元');
  assert.equal(record.priceBasis, '当年价格');
  assert.match(record.scope, /香港.*澳门.*台湾/);
  assert.match(record.source.yearbook.url, /^https:\/\/www\.stats\.gov\.cn\/sj\/ndsj\/2024\//);
  assert.match(record.source.yearbook.sha256, /^[0-9a-f]{64}$/);
  assert.equal(record.source.yearbook.table, '3-1 国内生产总值');
});

test('the yearbook OCR series covers 1978-2025 and matches known official anchors', () => {
  const years = Object.keys(record.series).map(Number).sort((a, b) => a - b);
  assert.deepEqual(years.slice(0, 2), [1978, 1979]);
  assert.deepEqual(years.slice(-3), [2023, 2024, 2025]);
  assert.equal(years.length, 48);
  const anchors = { 1978: 3678.7, 1990: 18872.9, 2000: 100280.1, 2010: 412119.3, 2020: 1013567.0, 2022: 1204724.0 };
  for (const [year, expected] of Object.entries(anchors)) {
    assert.ok(Math.abs(record.series[year].gdp - expected) < 0.2, year);
  }
  for (const row of Object.values(record.series)) {
    const parts = row.primary + row.secondary + row.tertiary;
    assert.ok(Math.abs(parts - row.gdp) / row.gdp < 0.005, `${row.gdp} vs ${parts}`);
  }
});

test('later revisions supersede the yearbook for their year', () => {
  assert.equal(record.series['2023'].gdp, 1294272);
  assert.equal(record.series['2023'].revision, '第五次全国经济普查后修订数');
  assert.equal(record.series['2024'].gdp, 1348066);
  assert.equal(record.series['2024'].revision, '最终核实');
  assert.equal(record.series['2025'].gdp, 1401879);
  assert.equal(record.series['2025'].revision, '初步核算');
  for (const year of ['2023', '2024', '2025']) {
    assert.match(record.series[year].url, /^https:\/\/www\.stats\.gov\.cn\//);
  }
});

test('missing values carry an explicit, sourced note instead of a substitute', () => {
  const note = notes.notes.TWN.gdp;
  assert.match(note.zh, /缺失/);
  assert.match(note.source, /^https:\/\//);
  assert.ok(note.en.length > 20);
});
