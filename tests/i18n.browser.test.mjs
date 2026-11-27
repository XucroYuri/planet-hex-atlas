import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

export const browserCases = {
  'zh-CN': ['zh-CN', '世界概览', '日本', '东京', '地区档案', '城市档案', '横轴指标', '百年对照', '目标对照'],
  en: ['en-US', 'World overview', 'Japan', 'Tokyo', 'Region profile', 'City profile', 'X-axis indicator', 'Century comparison', 'Goal comparison'],
  'zh-TW': ['zh-Hant-HK', '世界總覽', '日本', '東京', '地區檔案', '城市檔案', '橫軸指標', '百年對照', '目標對照'],
  es: ['es-MX', 'Panorama mundial', 'Japón', 'Tokio', 'Ficha regional', 'Ficha urbana', 'Indicador del eje X', 'Comparación a cien años', 'Comparación de objetivos'],
  fr: ['fr-CA', 'Vue mondiale', 'Japon', 'Tokyo', 'Fiche régionale', 'Fiche de la ville', 'Indicateur en abscisse', 'Comparaison sur un siècle', 'Comparaison des objectifs'],
  ja: ['ja-JP', '世界の概要', '日本', '東京', '地域の詳細', '都市の詳細', '横軸の指標', '百年の比較', '目標の比較'],
  ko: ['ko-KR', '세계 개요', '일본', '도쿄', '지역 상세 정보', '도시 상세 정보', '가로축 지표', '100년 비교', '목표 비교'],
  ar: ['ar-EG', 'نظرة على العالم', 'اليابان', 'طوكيو', 'ملف المنطقة', 'ملف المدينة', 'مؤشر المحور الأفقي', 'مقارنة على مدى قرن', 'مقارنة الأهداف'],
};

export const deepExpectations = {
  'zh-CN': ['地图图例', '邻近港口', '预期寿命', '已推进 100 / 100 年', '点可用', '数据来源与方法'],
  en: ['Map legend', 'Nearby ports', 'Life expectancy', 'Simulated 100 / 100 years', 'points available', 'Data sources and methods'],
  'zh-TW': ['地圖圖例', '鄰近港口', '預期壽命', '已推進 100 / 100 年', '點可用', '資料來源與方法'],
  es: ['Leyenda del mapa', 'Puertos cercanos', 'Esperanza de vida', 'Simulados 100 / 100 años', 'Disponibles:', 'Fuentes y métodos'],
  fr: ['Légende de la carte', 'Ports proches', 'Espérance de vie', '100 / 100 ans simulés', 'points disponibles', 'Sources et méthodes'],
  ja: ['地図の凡例', '近隣の港湾', '平均寿命', '100 年のうち 100 年を計算済み', 'ポイント利用可能', 'データの出典と手法'],
  ko: ['지도 범례', '인근 항구', '기대 수명', '100 / 100년 진행', '점 사용 가능', '데이터 출처와 방법'],
  ar: ['مفتاح الخريطة', 'الموانئ القريبة', 'العمر المتوقع', 'تمت محاكاة ١٠٠ / ١٠٠ سنة', 'المتاح', 'مصادر البيانات والمنهجية'],
};

export async function exerciseLocalizedPage([tag, expected, deep, checkLayout = true]) {
  const [, overview, country, city, regionProfile, cityProfile, xAxis, century, goals] = expected;
  const [legendName, ports, life, progress, budget, sources] = deep;
  const find = (selector) => document.querySelector(selector);
  const text = (selector) => find(selector)?.textContent.trim();
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const equals = (selector, value) => check(text(selector) === value, `${selector} expected ${value}, got ${text(selector)}`);
  const click = (selector) => {
    const control = find(selector);
    check(control && !control.disabled, `Control unavailable: ${selector}`);
    control.click();
  };
  const change = (selector, value, eventName = 'change') => {
    const control = find(selector);
    check(control, `Field unavailable: ${selector}`);
    control.value = value;
    check(control.value === value, `${selector} lost its machine value ${value}`);
    control.dispatchEvent(new Event(eventName, { bubbles: true }));
  };
  const waitFor = async (condition, description) => {
    const end = performance.now() + 12000;
    while (!condition() && performance.now() < end) await new Promise(resolve => setTimeout(resolve, 25));
    check(condition(), `Timed out: ${description}`);
  };
  const wait = selector => waitFor(() => find(selector), selector);
  const years = new Intl.NumberFormat(tag, { useGrouping: false, numberingSystem: tag === 'ar' ? 'arab' : undefined });
  const year = (value) => years.format(value);
  const assertLayout = () => {
    if (!checkLayout) return;
    const dialog = find('#overlay');
    check(document.documentElement.scrollWidth <= innerWidth + 1, 'Page overflow');
    if (dialog.open) check(dialog.scrollWidth <= dialog.clientWidth + 1, 'Dialog overflow');
  };

  await wait('#workspace[data-ready=true]');
  check(document.documentElement.lang === tag, 'Unexpected document language');
  check(document.documentElement.dir === (tag === 'ar' ? 'rtl' : 'ltr'), 'Unexpected document direction');
  check(find('#language').value === tag, 'Language selection does not match the page');
  for (const option of find('#language').options) check(option.lang === option.value, 'Language name lacks its BCP47 tag');
  equals('#inspector h1', overview);
  check(find('#legend').getAttribute('aria-label') === legendName, 'Legend label was not localized');
  assertLayout();
  click('#lens-button');
  click('[data-lens=income]');
  change('#year', '2010', 'input');
  equals('#year-label', year(2010));
  check(text('#legend').includes(year(2010)), 'Legend year is missing');
  check(find('#year').getAttribute('aria-valuetext').includes(year(2010)), 'Slider year is inaccessible');
  change('#year', '2023', 'input');

  click('#launch-search');
  const searchInput = '.search-field input';
  check(find(searchInput).placeholder && find(searchInput).getAttribute('aria-label'), 'Search field lacks labels');
  change(searchInput, country, 'input');
  const regionResult = '[data-action=search-country][data-value=JPN]';
  equals(`${regionResult} strong`, country);
  click(regionResult);
  equals('#inspector h1', country);
  equals('#inspector .section-tag > span', regionProfile);

  click('#launch-search');
  change(searchInput, city, 'input');
  const cityResult = '[data-action=search-city][data-value="1850147"]';
  equals(`${cityResult} strong`, city);
  click(cityResult);
  equals('#inspector h1', city);
  equals('#inspector .section-tag > span', cityProfile);
  await wait('#inspector .districts');
  check(find('#inspector .section-tag code').textContent === 'GEO 1850147', 'GeoNames ID changed');
  check([...document.querySelectorAll('#inspector dt')].some(term => term.textContent === ports), 'Facility count label was not localized');
  click('[data-action=fine-cell]');
  await waitFor(() => [...document.querySelectorAll('#inspector dd')].some(value => /^[0-9a-f]{15}$/.test(value.textContent)), 'H3 cell profile');

  click('#launch-search');
  change(searchInput, 'Taj Mahal', 'input');
  await wait('[data-action=search-heritage]');
  click('[data-action=search-heritage]');
  check(find('#inspector a[href*="/en/list/"]'), 'Heritage listing link was lost');
  check([...document.querySelectorAll('#inspector dd')].some(value => value.textContent === year(1983)), 'Heritage inscription year was not localized');
  click('#show-sources');
  equals('#overlay-title', sources);
  check(document.querySelectorAll('#overlay-body article').length === 11, 'Source attribution articles are incomplete');
  click('#close-overlay');
  await wait('#overlay:not([open])');

  click('#launch-search');
  change(searchInput, city, 'input');
  click(cityResult);

  click('[data-view=explorer]');
  await wait('.orbis-explorer');
  equals('.oe-controls .oe-field:first-child > span', xAxis);
  change('.oe-controls .oe-field:nth-child(1) select', 'income');
  change('.oe-controls .oe-field:nth-child(2) select', 'life');
  check(text('.oe-axis-y').includes(life), 'World Bank metric label was not localized');
  change('.oe-history-controls .oe-field:nth-child(2) select', 'JPN');
  change('.oe-history-controls .oe-field:nth-child(3) select', 'CHN');
  check(text('.oe-scatter .oe-readout').includes(country), 'Scatter selection was not localized');
  check(text('.oe-history .oe-readout').includes(country), 'Historical series name was not localized');
  check(find('.oe-history .oe-plot-svg path'), 'Historical chart did not draw');
  check(text('.oe-source-list').includes(life), 'World Bank indicator source did not render');
  const download = (selector) => {
    let file;
    const originalObjectUrl = URL.createObjectURL;
    const originalLinkClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = blob => { file = blob; return 'https://test.invalid/local-export'; };
    HTMLAnchorElement.prototype.click = () => {};
    try {
      click(selector);
      return file;
    } finally {
      URL.createObjectURL = originalObjectUrl;
      HTMLAnchorElement.prototype.click = originalLinkClick;
    }
  };
  const csv = download('.oe-actions [title]');
  check(csv?.type.startsWith('text/csv') && csv.size > 0, 'Explorer CSV export did not run');
  const fileText = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
  check((await fileText(csv)).includes(',JPN,'), 'Explorer CSV region IDs changed');
  assertLayout();
  click('#close-overlay');
  await wait('#overlay:not([open])');

  click('[data-view=scenario]');
  await wait('.oa-scenario');
  equals('.oas-panel:nth-child(3) h3', century);
  change('.oa-scenario [name=country]', 'JPN');
  change('.oa-scenario [name=year]', '2023');
  if (!find('.oa-scenario [data-action=adopt]').disabled) click('.oa-scenario [data-action=adopt]');
  check(text('.oas-context[data-role=origin]').includes(country), 'Scenario region name was not localized');
  change('[name=a-services]', '101', 'input');
  check(find('[name=a-services]').getAttribute('aria-invalid') === 'true', 'Budget validation missing');
  change('[name=a-services]', '50', 'input');
  change('[name=forest-floor]', '100', 'input');
  click('[data-advance="1"]');
  check(find('.oas-advance-status.oas-error') && text('.oas-advance-status').includes(year(2024)), 'Forest floor was not reported');
  change('[name=forest-floor]', '', 'input');
  click('[data-advance="100"]');
  check(find('[name=timeline]').max === '100', 'Simulated horizon is incomplete');
  equals('[data-role=progress]', progress);
  check(find('[name=timeline]').getAttribute('aria-valuetext').includes(year(2123)), 'Final year was not localized');
  check(find('.oas-chart-dot[data-path=a]'), 'Scenario chart did not draw');
  for (const details of document.querySelectorAll('.oas-details')) details.open = true;
  check(text('.oas-equation') && (tag === 'zh-CN' || !text('.oas-equation').includes('份额')), 'Scenario formula was not localized');
  check(find('.oas-phase-list li'), 'Scenario phase record is missing');
  const exported = download('.oa-scenario [data-action=export]');
  check(exported?.type === 'application/json', 'Scenario JSON export did not run');
  const json = await fileText(exported);
  const experiment = JSON.parse(json);
  check(experiment.observation.countryId === 'JPN' && experiment.simulation.baseline.at(-1).year === 2123, 'Scenario JSON lost its IDs or years');
  check(experiment.assumptions.metrics.find(metric => metric.id === 'life').name === life, 'Exported scenario labels were not localized');
  click('.oa-scenario [data-action=replay]');
  check(find('[name=timeline]').value === '0', 'Replay did not reset the cursor');
  const upload = find('.oa-scenario [name=import]');
  const imported = new File([json], 'orbis-test.json', { type: 'application/json' });
  Object.defineProperty(imported, 'text', { value: async () => json });
  Object.defineProperty(upload, 'files', { configurable: true, value: [imported] });
  upload.dispatchEvent(new Event('change'));
  await waitFor(() => find('[name=timeline]').value === '100', 'scenario import restores the final year');
  assertLayout();

  click('.council-entry');
  await wait('.oa-council');
  check([...document.querySelectorAll('.oa-council h3')].some(node => node.textContent === goals), 'Council goals were not localized');
  check(text('[data-view=check-a]').includes(budget), 'Council proposal validation was not localized');
  change('[name=policy-a]', 'services');
  change('[name=policy-b]', 'hold');
  click('.oa-council [data-action=advance]');
  check(find('.council-signals [data-result=sent]'), 'Council signal did not appear');
  change('[name=policy-a]', 'survey');
  click('.oa-council [data-action=advance]');
  change('[name=policy-a]', 'hold');
  click('.oa-council [data-action=advance]');
  find('.council-details').open = true;
  click('.oa-council [data-action=replay]');
  const archive = JSON.parse(text('[data-view=replay]'));
  check(archive.origin.region === 'JPN' && archive.actions.a.join(',') === 'services,survey,hold', 'Replay data changed');
  check(text('.council-clock').includes(year(2026)), 'Council year was not localized');
  assertLayout();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  test('Chromium 覆盖全部八种语言的动态界面', {
    skip: !process.env.ORBIS_BROWSER_TEST && '设置 ORBIS_BROWSER_TEST=1 后运行 Chromium 验收',
    timeout: 180000,
  }, async (suite) => {
    const { chromium } = createRequire(import.meta.url)('playwright');
    const browser = await chromium.launch({ channel: process.env.ORBIS_CHROME_CHANNEL || 'chrome' });
    const origin = 'http://orbis.test';
    const web = new URL('../web/', import.meta.url);
    try {
      for (const [tag, entry] of Object.entries(browserCases)) {
        await suite.test(tag, async () => {
          const context = await browser.newContext({ locale: entry[0], viewport: { width: 375, height: 842 } });
          try {
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await context.route('**/*', async (route) => {
              const request = route.request();
              const url = new URL(request.url());
              if (url.origin !== origin || request.method() !== 'GET') {
                errors.push(`Unexpected request to ${url.origin}`);
                await route.abort();
                return;
              }
              const file = fileURLToPath(new URL(url.pathname.slice(1) || 'index.html', web));
              await route.fulfill({ path: file, ...(file.endsWith('.js') && { contentType: 'text/javascript' }) });
            });
            await page.goto(origin);
            await page.evaluate(exerciseLocalizedPage, [tag, entry, deepExpectations[tag]]);
            if (tag === 'zh-CN') {
              await page.locator('#close-overlay').click();
              await page.locator('#language').selectOption('fr');
              await page.locator('html[lang=fr]').waitFor();
              await page.locator('#workspace[data-ready=true]').waitFor();
              assert.match(page.url(), /[?&]lang=fr(?:[&#]|$)/);
              assert.match(page.url(), /city=1850147/);
              await page.goto(origin);
              await page.locator('html[lang=fr]').waitFor();
              await page.goto(`${origin}/?lang=ar-EG`);
              await page.locator('html[lang=ar][dir=rtl]').waitFor();
              await page.goto(origin);
              await page.locator('html[lang=fr]').waitFor();
            }
            assert.deepEqual(errors, []);
          } finally {
            await context.close();
          }
        });
      }
    } finally {
      await browser.close();
    }
  });
}
