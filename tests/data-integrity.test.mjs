import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = new URL('../web/data/', import.meta.url).pathname;
const read = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const atlas = read('atlas.json');

test('atlas years, countries, metrics and cell counts are intact', () => {
  assert.equal(atlas.years.length, 66);
  assert.equal(atlas.years[0], 1960);
  assert.equal(atlas.years.at(-1), 2025);
  atlas.years.forEach((year, index) => assert.equal(year, 1960 + index));
  assert.equal(atlas.countries.length, 258);
  assert.equal(atlas.metrics.length, 29);
  assert.equal(atlas.counts.cells, 288122);
  for (const metric of atlas.metrics) {
    assert.match(metric.id, /^[a-zA-Z][a-zA-Z0-9]*$/);
    assert.ok(metric.name && metric.unit);
    assert.match(metric.updated, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('annual shards exist for every year and hold finite regional values', () => {
  const dir = join(ROOT, 'annual');
  const files = new Set(readdirSync(dir));
  for (const year of atlas.years) {
    const file = `${year}.json`;
    assert.ok(files.has(file), `missing annual/${file}`);
    const data = read(`annual/${file}`);
    assert.equal(data.year, year);
    const regions = Object.entries(data.regions);
    assert.ok(regions.length >= 150 && regions.length <= 258, `${year}: ${regions.length} regions`);
    let values = 0;
    for (const [code, region] of regions) {
      assert.match(code, /^[A-Z0-9]{3}$/);
      for (const [metric, value] of Object.entries(region)) {
        if (value === null || value === undefined) continue;
        assert.ok(Number.isFinite(value), `${year}/${code}/${metric} is not finite`);
        values += 1;
      }
    }
    assert.ok(values > 500, `${year}: only ${values} values`);
  }
});

test('history catalog coverage matches every published series shard', () => {
  const catalog = read('history/catalog.json');
  const areas = Object.entries(catalog.areas);
  assert.equal(areas.length, 275);
  const published = areas.filter(([, area]) => Object.keys(area.coverage || {}).length > 0);
  assert.equal(published.length, 243);
  assert.equal(Object.keys(catalog.totals).length, 11);
  for (const [id, area] of published) {
    const series = read(`history/series/${encodeURIComponent(id)}.json`);
    for (const [metric, [first, last, count]] of Object.entries(area.coverage)) {
      const points = series[metric];
      assert.ok(Array.isArray(points) && points.length > 0, `${id}/${metric} missing series`);
      assert.equal(points.length, count, `${id}/${metric} count`);
      assert.equal(points[0][0], first, `${id}/${metric} first year`);
      assert.equal(points.at(-1)[0], last, `${id}/${metric} last year`);
      let previous = -Infinity;
      for (const [year, value] of points) {
        assert.ok(Number.isInteger(year) && year > previous, `${id}/${metric} years not sorted`);
        assert.ok(Number.isFinite(value), `${id}/${metric}/${year} not finite`);
        previous = year;
      }
    }
  }
});

test('space, market and official China datasets keep their published shape', () => {
  const launches = read('space/launches.json');
  assert.equal(launches.totals.objects, 24865);
  assert.equal(Object.keys(launches.countries).length, 102);
  assert.equal(launches.years.length, 69);
  assert.deepEqual(launches.totals.latest, { year: 2025, count: 4510 });

  const ephemeris = read('space/ephemeris.json');
  assert.ok(ephemeris.objects.length >= 13);
  assert.equal(ephemeris.auKm, 149597870.7);
  for (const object of ephemeris.objects) {
    assert.ok(object.id && object.zh && object.en && object.kind);
  }

  const market = read('markets/index.json');
  assert.equal(market.symbols.length, 1404);
  assert.equal(market.rows, 54382);
  assert.equal(market.fields.length, 10);
  assert.equal(market.symbols.reduce((sum, symbol) => sum + symbol.count, 0), market.rows);
  assert.ok(market.first < market.last);

  const china = read('china-official.json');
  const years = Object.keys(china.series).map(Number).sort((a, b) => a - b);
  assert.equal(years.length, 48);
  assert.equal(years[0], 1978);
  assert.equal(years.at(-1), 2025);
  assert.equal(china.series['2024'].population, 140828);
  assert.equal(china.series['2025'].population, 140489);
  assert.equal(china.series['2023'].population, undefined);
  const benchmarks = read('china-population-official.json').years;
  assert.equal(Object.keys(benchmarks).length, 60);
  assert.equal(benchmarks['1955'].total, 61465);
  assert.equal(benchmarks['1978'].total, 96259);
  assert.equal(china.populationBenchmarks.years['2023'].total, 140967);
});

test('missing notes, changelog and source checksums are well formed', () => {
  const missing = read('missing-notes.json');
  assert.ok(Object.keys(missing.notes).length >= 2);
  for (const [region, metrics] of Object.entries(missing.notes)) {
    for (const [metric, note] of Object.entries(metrics)) {
      assert.ok(note.zh && note.en, `${region}/${metric} note`);
      assert.match(note.source, /^https?:\/\//);
    }
  }

  const changelog = read('changelog.json');
  assert.equal(changelog.entries.length, 6);
  for (const entry of changelog.entries) {
    assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(entry.zh && entry.en);
  }

  const lock = read('source-lock.json');
  const entries = Object.entries(lock);
  assert.ok(entries.length >= 10);
  for (const [name, entry] of entries) {
    assert.ok(entry && typeof entry === 'object', name);
    assert.match(entry.sha256, /^[0-9a-f]{64}$/, name);
    assert.ok(entry.bytes > 0, name);
    assert.match(entry.url, /^https?:\/\//, name);
  }
});

test('every referenced data file is present', () => {
  const required = [
    'atlas.json', 'overview.json', 'h2/world.bin', 'h3/0-0.bin', 'outlines.json', 'water.json',
    'cities.json', 'sites.json', 'heritage-points.json', 'observations.json', 'relief.webp', 'relief-compact.webp',
    'ATTRIBUTION.txt', 'source-lock.json', 'china-official.json', 'missing-notes.json',
    'changelog.json', 'history/catalog.json', 'history/sources.json',
    'space/launches.json', 'space/ephemeris.json', 'markets/index.json',
  ];
  for (const path of required) assert.ok(existsSync(join(ROOT, path)), `missing data/${path}`);
});
