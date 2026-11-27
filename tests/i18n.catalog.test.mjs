import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { LOCALES, matchLocale, resolveLocale } from '../web/js/i18n.js';
import shell from '../web/i18n/shell.js';
import geography from '../web/i18n/geography.js';
import profiles from '../web/i18n/profiles.js';
import explorer from '../web/i18n/explorer.js';
import simulation from '../web/i18n/simulation.js';
import council from '../web/i18n/council.js';
import standards from '../web/i18n/standards.js';
import cities from '../web/i18n/cities.js';

const read = (path) => readFileSync(new URL(`../web/${path}`, import.meta.url), 'utf8');
const rows = [...shell, ...geography, ...profiles, ...explorer, ...simulation, ...council, ...standards];
const keys = new Set(rows.map(row => row[0]));
const han = /\p{Script=Han}/u;
const placeholders = (message) => [...new Set(message.match(/\{[a-z]\w*\}/gi) || [])].sort();

test('BCP47 匹配及语言优先级', () => {
  assert.equal(matchLocale('ZH-hant-HK'), 'zh-TW');
  assert.equal(matchLocale('zh-Hans-TW'), 'zh-CN');
  assert.equal(matchLocale('zh-MO'), 'zh-TW');
  assert.equal(matchLocale('es-MX-u-nu-latn'), 'es');
  assert.equal(matchLocale('fr-CA'), 'fr');
  assert.equal(matchLocale('en_US'), null);
  assert.equal(resolveLocale('ja-JP', 'fr', ['ko-KR']), 'ja');
  assert.equal(resolveLocale('bogus', 'ar-EG', ['fr-CA']), 'ar');
  assert.equal(resolveLocale(null, null, ['de', 'ko-KR', 'fr-CA']), 'de');
  assert.equal(resolveLocale(null, null, ['de-AT']), 'de');
});

test('规范化保存语言偏好，储存受限时仍可解析指定语言', async () => {
  const writes = [];
  globalThis.window = {
    location: { search: '?lang=es-MX' },
    localStorage: {
      getItem: () => 'fr-CA',
      setItem: (...args) => writes.push(args),
    },
    navigator: { languages: ['en-US'] },
  };
  try {
    const { getLocale, saveLocalePreference } = await import('../web/js/i18n.js?test=preference');
    assert.equal(getLocale(), 'es');
    assert.equal(saveLocalePreference('zh-Hant-HK'), 'zh-TW');
    assert.equal(saveLocalePreference('invalid!'), null);
    assert.deepEqual(writes, [['orbis-atlas.locale', 'zh-TW']]);
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('Blocked storage'); } });
    assert.equal(saveLocalePreference('ko-KR'), 'ko');
    const blocked = await import('../web/js/i18n.js?test=blocked-storage');
    assert.equal(blocked.getLocale(), 'es');
  } finally {
    delete globalThis.window;
  }
});

test('覆盖范围内的源码和数据标签均有目录条目', () => {
  assert.equal(keys.size, rows.length, '文案键重复');
  const html = read('index.html').split('<noscript>')[0];
  const sources = [...html.matchAll(/>([^<>]*\p{Script=Han}[^<>]*)</gu)].map(match => match[1].trim());
  sources.push(...[...html.matchAll(/\b(?:aria-label|title|content)="([^"]*)"/g)].map(match => match[1]).filter(value => han.test(value)));
  for (const file of ['app', 'data', 'map', 'globe', 'inspector', 'explorer', 'scenario', 'sim-model', 'council', 'council-model', 'i18n-places']) {
    const matches = read(`js/${file}.js`).matchAll(/(['"])([^'"\n<>]*\p{Script=Han}[^'"\n<>]*)\1/gu);
    for (const [, , key] of matches) sources.push(key);
  }
  const atlas = JSON.parse(read('data/atlas.json'));
  for (const { name, group, unit, description } of atlas.metrics) sources.push(name, group, unit, description);
  sources.push(...atlas.biomes.map(([name]) => name));
  sources.push(...new Set(JSON.parse(read('data/sites.json')).filter(site => site[1] === 2).map(site => site[7])));
  sources.push(...new Set(JSON.parse(read('data/heritage-points.json')).map(site => site[7])));
  assert.deepEqual([...new Set(sources.filter(key => han.test(key) && !keys.has(key)))], []);
  const siteCities = new Set(JSON.parse(read('data/cities.json')).map(city => city[0]));
  for (const [id, labels] of Object.entries(cities)) {
    assert.ok(siteCities.has(id), id);
    for (const [locale, label] of Object.entries(labels)) assert.ok(matchLocale(locale) === locale && label.trim());
  }
});

for (const [index, { tag }] of LOCALES.slice(0, 8).entries()) {
  test(`${tag} · ${rows.length} 条文案及插值`, async () => {
    for (const row of rows) {
      const source = row[0];
      const translation = row[index];
      assert.equal(row.length, 8, source);
      assert.ok(typeof translation === 'string' && translation.trim(), source);
      assert.deepEqual(placeholders(translation), placeholders(source), source);
      if (['en', 'es', 'fr', 'ko', 'ar'].includes(tag)) assert.ok(!han.test(translation), source);
    }
    globalThis.window = {
      location: { search: '?lang=invalid!' },
      localStorage: { getItem: () => null },
      navigator: { languages: [tag] },
    };
    try {
      const localeModule = await import(`../web/js/i18n.js?test=${tag}`);
      localeModule.registerMessages(rows);
      assert.equal(localeModule.getLocale(), tag);
      for (const row of rows) assert.equal(localeModule.msg(row[0]), row[index]);
      assert.equal(localeModule.t('新增模块文本', 'English fallback'), tag === 'zh-CN' ? '新增模块文本' : 'English fallback');
      const label = localeModule.htmlText('打开{name}档案', { name: '<b>&' });
      assert.ok(label.includes('&lt;b&gt;&amp;'));
      assert.ok(!label.includes('{name}'));
      const numberingSystem = tag === 'ar' ? 'arab' : undefined;
      assert.equal(localeModule.formatYear(2023), new Intl.NumberFormat(tag, { useGrouping: false, numberingSystem }).format(2023));
    } finally {
      delete globalThis.window;
    }
  });
}
