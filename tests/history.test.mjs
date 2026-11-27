import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { backtestHistory, backtestVerdict, HISTORY_TRANSLATIONS, renderHistory } from '../web/js/history-lab.js';

const read = path => JSON.parse(readFileSync(new URL(`../web/data/history/${path}`, import.meta.url), 'utf8'));
const closeTo = (actual, expected, tolerance = 1e-10) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);
};

test('历史入口与词条契约可独立导入，插值参数保持一致', () => {
  assert.equal(typeof renderHistory, 'function');
  for (const { zh, en } of Object.values(HISTORY_TRANSLATIONS)) {
    assert.ok(zh && en);
    const names = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    assert.deepEqual(names(zh), names(en));
  }
  for (const site of read('evidence.json')) {
    assert.ok(HISTORY_TRANSLATIONS[site.id]);
    assert.ok(HISTORY_TRANSLATIONS[`${site.id}Note`]);
  }
});

test('在不均匀、跨纪元的历年上拟合，留后值无法泄漏到参数', () => {
  const years = [-5, -3, 1, 4, 10];
  const points = years.map(year => [year, 7 * Math.exp(0.12 * ((year < 0 ? year + 1 : year) + 4))]);
  const result = backtestHistory(points, 1);
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.training, { count: 3, first: -5, last: 1 });
  assert.deepEqual(result.holdout, { count: 2, first: 4, last: 10 });
  assert.deepEqual(result.predictions.map(row => row.lead), [3, 9]);
  closeTo(result.intercept, Math.log(7));
  closeTo(result.slope, 0.12);
  closeTo(result.modelError.mape, 0);
  assert.ok(result.baselineError.mape > 0.4);

  const changed = points.map(([year, value]) => [year, year > 1 ? value * 2 : value]);
  const rechecked = backtestHistory(changed, 1);
  closeTo(rechecked.slope, result.slope);
  closeTo(rechecked.intercept, result.intercept);
  closeTo(rechecked.modelError.mape, 0.5);
});

test('回测结论比较拟合与基线并处理相似与不充分情形', () => {
  const base = { status: 'ok', modelError: { mape: 0.1 }, baselineError: { mape: 0.2 } };
  assert.equal(backtestVerdict(base), 'modelBetter');
  assert.equal(backtestVerdict({ ...base, modelError: { mape: 0.2 }, baselineError: { mape: 0.1 } }), 'baselineBetter');
  assert.equal(backtestVerdict({ ...base, modelError: { mape: 0.2 }, baselineError: { mape: 0.201 } }), 'similar');
  assert.equal(backtestVerdict({ status: 'insufficient' }), 'insufficient');
});

test('零值排除、两个方向的样本不足以及常量基线', () => {
  const points = [[1, 0], [20, 10], [40, 10], [50, 10], [75, 10], [90, 10]];
  for (const cutoff of [40, 75]) {
    assert.deepEqual(backtestHistory(points, cutoff), { status: 'insufficient', positive: 5, excluded: 1 });
  }
  const fit = backtestHistory(points, 50);
  assert.equal(fit.excluded, 1);
  closeTo(fit.slope, 0);
  closeTo(fit.modelError.mae, 0);
  assert.deepEqual(fit.baselineError, { mae: 0, mape: 0 });
});

test('用中国实际人口序列核对近代截止年的留后误差', () => {
  const points = read('series/CHN.json').population.filter(([year]) => year >= 1950);
  const fit = backtestHistory(points, 2008);
  assert.equal(fit.status, 'ok');
  assert.deepEqual(fit.training, { count: 59, first: 1950, last: 2008 });
  assert.deepEqual(fit.holdout, { count: 15, first: 2009, last: 2023 });
  assert.deepEqual(fit.predictions.map(row => row.lead), Array.from({ length: 15 }, (_, index) => index + 1));
  closeTo(fit.annualChange, 0.01645810388923025);
  closeTo(fit.modelError.mape, 0.2111168739175778);
  closeTo(fit.baselineError.mape, 0.04442107716102837);
  assert.ok(backtestHistory(points, 2015).modelError.mape < fit.modelError.mape);
});

test('原始年点、分期、真实零值和官方普查记录均可定位', () => {
  const { areas, totals } = read('catalog.json');
  assert.equal(totals.population.areas, 233);
  assert.deepEqual(totals.lifeExpectancy, { rows: 19105, areas: 231 });
  assert.deepEqual(totals.literacy, { rows: 1164, areas: 174 });
  assert.deepEqual(totals.pasture, { rows: 126, areas: 1 });
  assert.deepEqual(totals.density, { rows: 54475, areas: 230 });
  assert.deepEqual(totals.worldGdp, { rows: 51, areas: 1 });
  assert.deepEqual(totals.urbanShare, { rows: 17094, areas: 231 });
  assert.deepEqual(areas.WORLD.coverage.urbanShare, [1950, 2023, 74]);
  assert.equal(new Map(read('series/WORLD.json').urbanShare).get(2023), 57.3536);
  assert.deepEqual(areas.WORLD.coverage.worldGdp, [1, 2025, 51]);
  assert.equal(new Map(read('series/WORLD.json').worldGdp).get(2025), 180028791385506);
  assert.deepEqual(areas.WORLD.coverage.density, [-10000, 2023, 261]);
  assert.equal(new Map(read('series/WORLD.json').density).get(2023), 62.174232);
  assert.deepEqual(areas.WORLD.coverage.pasture, [-10000, 2023, 126]);
  assert.equal(new Map(read('series/WORLD.json').pasture).get(2023), 7433910.11);
  assert.deepEqual(areas.WORLD.coverage.lifeExpectancy, [1770, 2023, 81]);
  assert.deepEqual(areas.GBR.coverage.lifeExpectancy, [1543, 2023, 242]);
  assert.equal(new Map(read('series/WORLD.json').lifeExpectancy).get(2023), 73.1694);
  assert.equal(new Map(read('series/CHN.json').lifeExpectancy).get(2023), 77.9529);
  assert.deepEqual(areas.WORLD.coverage.literacy, [1975, 2024, 50]);
  assert.equal(new Map(read('series/WORLD.json').literacy).get(2024), 87.74);
  assert.equal(new Map(read('series/CHN.json').literacy).get(2020), 96.74);
  assert.equal(totals.gdp.areas, 165);
  assert.deepEqual(totals.cropland, { rows: 296, areas: 11 });
  assert.deepEqual(totals.census, { rows: 24, areas: 2 });
  assert.deepEqual(areas.WORLD.coverage.population, [-10000, 2023, 261]);
  assert.deepEqual(areas.HYDE_CHN.coverage.cropland, [-4000, 2015, 17]);
  assert.equal(areas.HYDE_CHN.mapId, undefined);
  assert.equal(areas.CHN.mapId, 'CHN');
  assert.deepEqual(read('series/WORLD.json').cropland[0], [-10000, 0]);
  assert.equal(new Map(read('series/HYDE_CHN.json').cropland).get(1100), 615000);
  assert.equal(new Map(read('series/CHN.json').gdp).get(1000), 1225.107);
  assert.equal(new Map(read('series/CHN.json').gdp).has(1001), false);
  assert.deepEqual(read('series/USA.json').census.at(-1), [2020, 331449281]);
  assert.ok(read('maddison-sources.json').byRegion.CHN.some(([, reference]) => reference.includes('Broadberry')));
  const sites = read('evidence.json');
  assert.deepEqual(sites[0].age, [281, 349]);
  assert.equal(sites.find(site => site.id === 'omo').kind, 'minimum');
  assert.ok(sites.every(site => site.papers.every(([, , doi]) => /^10\.\d+\//.test(doi))));
});
