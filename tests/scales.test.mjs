import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PALETTES, buildScale, interpolateOklab, jenksBreaks, paletteIdFor, rgbToOklab,
} from '../web/js/scales.js';

const hexToRgb = (h) => { const v = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255); };
const lightness = (h) => rgbToOklab(hexToRgb(h))[0];
const flat = (n, f) => Array.from({ length: n }, (_, i) => f(i));

test('Jenks natural breaks recover the obvious two clusters', () => {
  assert.deepEqual(jenksBreaks([1, 2, 3, 10, 11, 12], 2), [1, 3, 12]);
});

test('uniform data uses equal intervals and a monotone-lightness palette', () => {
  const values = flat(200, (i) => i);
  const scale = buildScale(values, { id: 'income', scale: 'total' });
  assert.equal(scale.method, 'equal');
  assert.equal(scale.classify(-1), 0);
  assert.equal(scale.classify(0), 0);
  assert.equal(scale.classify(199), scale.colors.length - 1);
  const ls = scale.colors.map(lightness);
  for (let i = 1; i < ls.length; i++) assert.ok(ls[i] < ls[i - 1] - 0.01, `lightness must fall: ${ls}`);
});

test('heavy-tailed positive data is classified in log space', () => {
  const values = flat(400, (i) => Math.exp(i / 40));
  const scale = buildScale(values, { id: 'pop', scale: 'total' });
  assert.ok(scale.method.startsWith('log'), scale.method);
  assert.equal(scale.transform, 'log');
  const edges = scale.breaks;
  for (let i = 2; i < edges.length; i++) {
    assert.ok(edges[i] - edges[i - 1] > edges[i - 1] - edges[i - 2], 'log classes widen geometrically');
  }
});

test('percent metrics stay on the 0-100 domain with adaptive or equal breaks', () => {
  const clustered = flat(200, (i) => 80 + (i % 10));
  const scale = buildScale(clustered, { id: 'life', scale: 'percent' });
  assert.ok(['percentEqual', 'percentQuantile'].includes(scale.method));
  assert.equal(scale.breaks[0], 0);
  assert.equal(scale.breaks.at(-1), 100);
  assert.equal(scale.classify(-1), 0);
  assert.equal(scale.classify(50), 0);
  assert.equal(scale.classify(101), scale.colors.length - 1);
});

test('diverging metrics are zero-centred and symmetric', () => {
  const values = [...flat(100, (i) => -5 - i / 10), ...flat(100, (i) => 1 + i / 5)];
  const scale = buildScale(values, { id: 'growth', scale: 'diverging' });
  assert.equal(scale.method, 'diverging');
  const b = scale.breaks;
  assert.ok(b[0] < 0 && b.at(-1) > 0);
  assert.ok(Math.abs(b[0] + b.at(-1)) < 1e-9, 'symmetric around zero');
  assert.equal(scale.colors.length, b.length - 1);
  assert.equal(scale.colors.length % 2, 1);
});

test('elevation uses fixed hypsometric breaks and includes sea level', () => {
  const scale = buildScale(flat(100, (i) => i * 40 - 2000), { id: 'height', scale: 'height', min: -9500, max: 6000 });
  assert.equal(scale.method, 'fixed');
  assert.equal(scale.breaks[0], -9500);
  assert.equal(scale.breaks.at(-1), 6500);
  assert.ok(scale.breaks.some((v) => v === 0));
  assert.equal(paletteIdFor({ id: 'height', scale: 'height' }), 'hypso');
});

test('class counts, missing values and legend ranges are internally consistent', () => {
  const values = flat(300, (i) => (i % 7 === 0 ? null : (i * 13) % 301));
  const scale = buildScale(values, { id: 'gdp', scale: 'total' });
  const nulls = values.filter((v) => v === null).length;
  const counts = scale.entries.reduce((a, e) => a + e.count, 0);
  assert.equal(counts, values.length - nulls);
  assert.equal(scale.missing, nulls);
  assert.equal(scale.entries.length, scale.colors.length);
  assert.ok(scale.breaks.every((v, i, a) => i === 0 || v >= a[i - 1]));
  assert.equal(scale.colorOf(null), scale.missingColor);
});

test('every palette family is perceptually distinct and lightness-monotone', () => {
  const mids = {};
  for (const [id, palette] of Object.entries(PALETTES)) {
    const scale = buildScale(flat(100, (i) => i), { id, scale: 'total', palette: id });
    const ls = scale.colors.map(lightness);
    if (palette.type === 'diverging') {
      const middle = (ls.length - 1) / 2;
      assert.ok(Math.abs(ls[0] - ls.at(-1)) < 0.12, `${id} diverging endpoints should be equally dark: ${ls}`);
      assert.ok(ls[Math.floor(middle)] === Math.max(...ls), `${id} diverging centre should be lightest: ${ls}`);
    } else {
      const monotone = ls.every((v, i) => i === 0 || v <= ls[i - 1] + 1e-9) || ls.every((v, i) => i === 0 || v >= ls[i - 1] - 1e-9);
      assert.ok(monotone, `${id} lightness not monotone: ${ls}`);
    }
    mids[id] = rgbToOklab(hexToRgb(interpolateOklab(palette.stops, 0.5)));
  }
  const ids = Object.keys(mids);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const d = Math.hypot(...[0, 1, 2].map((k) => mids[ids[i]][k] - mids[ids[j]][k]));
      if (d < 0.045) throw new Error(`Palette midpoints too similar: ${ids[i]} vs ${ids[j]} dE=${d.toFixed(3)}`);
    }
  }
});

test('metric semantics select different palette families', () => {
  const pairs = [
    ['income', 'magnitude'], ['life', 'lagoon'], ['growth', 'balance'], ['forest', 'terra'],
    ['co2', 'ember'], ['renew', 'terra'], ['industry', 'indigo'], ['pop', 'plum'],
  ];
  for (const [id, expected] of pairs) assert.equal(paletteIdFor({ id, scale: 'linear', code: 'X' }), expected, id);
});

test('classification of 100k values stays fast after one calibration', () => {
  const values = flat(100000, (i) => Math.abs(Math.sin(i)) * 1000 + i * 1e-3);
  const started = performance.now();
  const scale = buildScale(values, { id: 'pop', scale: 'total' });
  let sum = 0;
  for (const v of values) sum += scale.classify(v);
  const elapsed = performance.now() - started;
  assert.ok(sum > 0);
  assert.ok(elapsed < 400, `classification took ${elapsed.toFixed(1)}ms`);
});
