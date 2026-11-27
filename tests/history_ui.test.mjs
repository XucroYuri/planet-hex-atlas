import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { setTimeout } from 'node:timers/promises';
import { test } from 'node:test';
import { renderHistory } from '../web/js/history-lab.js';

const require = createRequire(import.meta.url);
let JSDOM;
try {
  ({ JSDOM } = require(process.env.HISTORY_TEST_DOM_MODULE || 'jsdom'));
} catch (error) {
  if (process.env.HISTORY_TEST_DOM_MODULE || error.code !== 'MODULE_NOT_FOUND') throw error;
}

const until = async (condition, description) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (condition()) return;
    await setTimeout(10);
  }
  assert.fail(description);
};

test('地区、时段、年点和回测联动，地图及双语契约可独立集成', {
  skip: !JSDOM && 'jsdom is optional. Set HISTORY_TEST_DOM_MODULE to its installed module path.',
}, async context => {
  const { window } = new JSDOM('<!doctype html><html><head></head><body><main></main></body></html>', {
    url: 'https://atlas.test/',
  });
  context.after(() => window.close());
  const calls = [];
  context.mock.method(globalThis, 'fetch', async url => {
    calls.push(new URL(url).pathname.split('/data/history/')[1]);
    return new Response(await readFile(url));
  });
  const host = window.document.querySelector('main');
  const element = query => host.querySelector(query);
  const controls = name => element(`[name="history-${name}"]`);
  const change = (name, value) => {
    controls(name).value = value;
    controls(name).dispatchEvent(new window.Event('change', { bubbles: true }));
  };
  const click = target => target.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const activeYear = () => element('svg .hl-selected')?.dataset.year;
  const publishedYears = () => host.querySelectorAll('svg .hl-point').length;
  const regions = [];
  await renderHistory(host, {
    country: { id: 'CHN' }, locale: 'de-DE',
    t: (zh, en) => zh === '深时历史工作台' ? 'Historisches Labor' : en,
    onSelect: id => regions.push(id),
  });
  assert.equal(element('h2').textContent, 'Historisches Labor');
  assert.equal(controls('region').value, 'CHN');
  assert.match(element('.hl-readout').textContent, /1\.422\.584\.930/);
  assert.ok(element('.hl-sites').textContent.includes('Tongtianyan'));
  assert.deepEqual(calls.toSorted(), ['catalog.json', 'evidence.json', 'provenance.json', 'series/CHN.json']);
  assert.ok(window.document.querySelector('link[rel="stylesheet"]').href.endsWith('/web/history.css'));

  change('period', 'modern');
  await until(() => publishedYears() === 74, 'Expected 74 modern demographic data points');
  assert.equal(controls('cutoff').value, '2008');
  assert.match(element('.hl-backtest').textContent, /21,11\s*%/);
  assert.match(element('.hl-backtest').textContent, /4,44\s*%/);
  change('year', '1961');
  assert.equal(activeYear(), '1961');
  assert.equal(element('tr.hl-selected').dataset.year, '1961');
  click(element('svg .hl-point[data-year="1962"]'));
  assert.equal(controls('year').value, '1962');
  assert.equal(element('tr.hl-selected').dataset.year, '1962');
  click(element('tr[data-year="1963"] button'));
  assert.equal(activeYear(), '1963');
  change('cutoff', '2015');
  assert.equal(host.querySelectorAll('.hl-backtest details tbody tr').length, 8);

  change('metric', 'gdp');
  await until(() => element('.hl-bibliography'), 'Expected original Maddison bibliography');
  assert.match(element('.hl-bibliography').textContent, /Broadberry/);
  assert.ok(calls.includes('maddison-sources.json'));
  change('metric', 'arable');
  await until(() => element('.hl-key-compiled'), 'Expected WDI compiled statistics');
  assert.match(element('.hl-backtest').textContent, /percentage points/);
  change('metric', 'census');
  assert.match(element('.hl-series-body').textContent, /no records/);
  assert.equal(publishedYears(), 0);
  change('region', 'USA');
  await until(() => element('svg rect.hl-observed'), 'Expected observed census counts');
  assert.ok(element('tr.hl-missing-row').textContent.includes('Missing'));
  assert.match(element('.hl-readout').textContent, /331\.449\.281/);
  click(element('.hl-controls button'));
  assert.deepEqual(regions, ['USA']);

  change('metric', 'cropland');
  change('region', 'HYDE_CHN');
  change('period', 'medieval');
  await until(() => publishedYears() === 3, 'Expected three medieval HYDE land-use benchmarks');
  assert.equal(activeYear(), '1400');
  assert.match(element('.hl-backtest').textContent, /at least 3 training and 2 holdout/);
  assert.equal(element('.hl-controls button').disabled, true);
  click(element('.hl-section-header button'));
  assert.equal(controls('region').value, 'WORLD');
  assert.equal(controls('period').value, 'deep');
  assert.equal(host.querySelectorAll('.hl-site').length, 10);
  assert.ok(element('.hl-coverage-chronologicalGap').textContent.includes('10000 BCE'));
  assert.equal(publishedYears(), 0);
  assert.ok(element('.hl-sites a[href^="https://doi.org/"]'));
  click(element('.hl-site button'));
  assert.deepEqual(regions, ['USA', 'MAR']);
});
