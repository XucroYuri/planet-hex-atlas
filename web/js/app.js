import { AtlasMap } from './map.js';
import { LANDING_CITIES, LOCAL_LENSES, SITES, TERRAIN, TILE_KM, clamp, coordinates, esc, format, formatDistance, load, localizeMetric } from './data.js';
import { formatCount, formatPercent, formatYear, getLocale, htmlText, localizePage, msg, saveLocalePreference, yearLabel, t, loadLocalePack } from './i18n.js';
import { createObservationStore } from './observation-store.js';
import { researchModes } from './research.js';
import { cityName, citySearchNames, continentName, countryName, countrySearchNames, regionName, searchKey, siteName } from './i18n-places.js';
import { renderAdvisors, renderInspector, renderSources } from './inspector.js';

const $ = (id) => document.getElementById(id);
const state = {
  lens: TERRAIN,
  year: 2023,
  selection: null,
  options: { grid: true, labels: true, art: true, sites: new Set() },
  cities: [],
  observations: {},
  level: 2,
};
const dialog = $('overlay');
const dialogBody = $('overlay-body');
const canvas = $('atlas-map');
const readNumber = (value) => value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
let atlas;
let map;
let byId;
let lenses;
let interval;
let toastTimer;
let sitePromise;
let heritagePromise;
let searchPlaces;
let focusBeforeDialog;
let focusRequest = 0;
let yearRequest = 0;
let detailPromise;
let cityPromise;
let observations;
let dialogRequest;

const value = (id, metric, year) => observations?.value(id, metric, year) ?? null;
const itemCountry = () => state.selection?.country || byId.get(state.selection?.item?.[3]) || null;

function notify(message) {
  const toast = $('map-toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
}

function render() {
  renderInspector($('inspector'), { ...state, atlas, byId, value, missingNotes: state.missingNotes });
}

function changeLens(lens) {
  state.lens = lens;
  $('lens-label').textContent = lens.name;
  const values = new Map();
  if (lens.code && observations.ready(state.year)) for (const country of atlas.countries) values.set(country.id, value(country.id, lens.id, state.year));
  const classifier = map.setLens(lens, values);
  if (lens.code && !map.detailsReady) void loadDetails().catch(() => {});
  renderLegend(classifier, lens, values);
  for (const button of $('lens-panel').querySelectorAll('[data-lens]')) button.setAttribute('aria-pressed', String(button.dataset.lens === lens.id));
  $('time-note').textContent = lens.code ? msg('着色按同一观测年份')
    : msg('格网人口固定为 {year} 年估算', { year: formatYear(atlas.gridYear) });
  render();
}

const METHOD_LABELS = {
  equal: ['等距分级', 'Equal interval'],
  jenks: ['自然断点', 'Natural breaks'],
  quantile: ['分位数分级', 'Quantile'],
  logEqual: ['对数等距分级', 'Log interval'],
  logJenks: ['自然断点（对数）', 'Natural breaks (log)'],
  logQuantile: ['分位数（对数）', 'Quantile (log)'],
  percentEqual: ['百分比等距', 'Equal percent'],
  percentQuantile: ['百分比分位数', 'Quantile percent'],
  diverging: ['对称发散', 'Diverging'],
  fixed: ['固定分级', 'Fixed classes'],
  empty: ['无数据', 'No data'],
};
const methodLabel = (method) => { const [zh, en] = METHOD_LABELS[method] || METHOD_LABELS.equal; return t(zh, en); };

function renderLegend(classifier, lens, countryValues) {
  const { year, options } = state;
  const legend = $('legend');
  if (lens.id === 'terrain' || lens.id === 'biome') {
    const colors = lens.id === 'terrain'
      ? [['#5c8799', '海洋'], ['#6e957c', '低地'], ['#c7a77d', '高地'], ['#d8e2d8', '冰盖']]
      : [1, 3, 6, 7, 11, 13, 15].map((key) => atlas.biomes[key]).map(([label, color]) => [color, label]);
    if (lens.id === 'terrain') colors.push(['#fbdb92', '城市']);
    for (const index of options.sites) colors.push([['#7bd4d7', '#f1ead4', '#eead69', '#e7a7a8'][index], SITES[index]]);
    legend.innerHTML = `<div class="legend-title">${htmlText(lens.id === 'terrain' ? '地形与居民点' : '主要生态带')}</div><div class="legend-keys">${colors.map(([color, label]) => `<span><i style="--key:${color}"></i>${htmlText(label)}</span>`).join('')}</div>`;
    return;
  }
  const suffix = lens.code ? ` · ${formatYear(year)}` : ['gridPop', 'density'].includes(lens.id) ? ` · ${formatYear(atlas.gridYear)}` : '';
  if (!classifier || classifier.method === 'empty') {
    legend.innerHTML = `<div class="legend-title">${esc(lens.name + suffix)}</div><div class="legend-sub"><span>${htmlText('当前视图无可用数据')}</span></div>`;
    return;
  }
  const unit = lens.unit;
  const legendNumber = new Intl.NumberFormat(getLocale(), { maximumSignificantDigits: 3 });
  const legendCompact = new Intl.NumberFormat(getLocale(), { notation: 'compact', maximumSignificantDigits: 2 });
  const number = (n) => (Math.abs(n) >= 1e4 ? legendCompact.format(n) : legendNumber.format(n));
  const label = (n) => (unit === '%' ? `${number(n)}%` : `${number(n)} ${msg(unit || '')}`.trim());
  const signed = classifier.domain[0] < 0;
  const joinRange = (a, b) => (signed
    ? htmlText('{a} 至 {b}', { a: label(a), b: label(b) })
    : `${esc(label(a))}–${esc(label(b))}`);
  const measured = lens.code ? [...countryValues.values()].filter(Number.isFinite).length : classifier.total;
  const visible = classifier.entries;
  const zeroClass = classifier.entries[0]?.zero === true;
  const maxShare = Math.max(...visible.map((entry) => entry.count), 1);
  const classes = visible.map((entry, index) => {
    let text;
    if (entry.zero) text = esc(label(0));
    else if (index === (zeroClass ? 1 : 0)) text = `≤ ${esc(label(entry.to))}`;
    else if (index === visible.length - 1) text = `≥ ${esc(label(entry.from))}`;
    else text = joinRange(entry.from, entry.to);
    const share = classifier.total ? entry.count / classifier.total : 0;
    return `<li class="legend-class${entry.count ? '' : ' legend-empty'}" title="${text} · ${formatPercent(share * 100)} · ${htmlText('{n} 个', { n: formatCount(entry.count) })}"><i style="--key:${entry.color}"></i><span class="legend-range">${text}</span><span class="legend-share" aria-hidden="true"><b style="--share:${(entry.count / maxShare * 100).toFixed(1)}%;--key:${entry.color}"></b></span></li>`;
  }).join('');
  const missing = classifier.missing;
  legend.innerHTML = `<div class="legend-title">${esc(lens.name + suffix)}</div>
    <div class="legend-method">${htmlText('{method} · {n} 级', { method: methodLabel(classifier.method), n: formatCount(classifier.entries.length) })}${classifier.transform === 'log' ? ' · ' + htmlText('对数轴') : ''}</div>
    <ul class="legend-classes">${classes}${missing ? `<li class="legend-class legend-missing"><i></i><span class="legend-range">${htmlText('缺失 {n}', { n: formatCount(missing) })}</span><span class="legend-share" aria-hidden="true"></span></li>` : ''}</ul>
    ${lens.code ? `<div class="legend-sub"><span>${htmlText('{count}/{total} 地域有数据', {
      count: formatCount(measured), total: formatCount(atlas.countries.length),
    })}</span><span>${htmlText('2–98% 截尾分级')}</span></div>` : `<div class="legend-sub"><span>${htmlText('按当前视图抽样标定')}</span><span>${htmlText('2–98% 截尾分级')}</span></div>`}`;
}

async function changeYear(year) {
  const chosen = clamp(year, atlas.years[0], atlas.years.at(-1));
  const request = ++yearRequest;
  state.year = chosen;
  $('year').value = chosen;
  $('year-label').textContent = formatYear(chosen);
  $('year').setAttribute('aria-valuetext', yearLabel(chosen));
  if (!observations.ready(chosen)) {
    changeLens(state.lens);
    $('time-note').textContent = t('观测数据加载中','Loading observations');
    await observations.ensureYear(chosen).catch(() => {
      if (request === yearRequest) {
        setPlaying(false);
        notify(t('年度数据加载失败，点击年份可重试。','The selected year could not be loaded. Select it again to retry.'));
      }
    });
  }
  if (request === yearRequest) changeLens(state.lens);
}

function summarizeMap(camera, level) {
  state.level = level;
  const flat = map?.projection === 'flat';
  $('projection').textContent = msg(flat ? '球面' : '展图');
  $('projection').setAttribute('aria-label', msg(flat ? '切换为球面' : '切换为平面地图'));
  $('bearing').textContent = coordinates(camera.lat, camera.lon);
  $('scale-indicator').textContent = `H3 R${level} · \u2068${formatDistance(TILE_KM[level])}\u2069`;
}

async function loadSites() {
  if (!sitePromise) {
    sitePromise = Promise.all([load('sites.json'), loadHeritage()]).then(([facilities, heritage]) => {
      const items = facilities.concat(heritage);
      state.sitesFailed = false;
      state.sites = items;
      map.setSites(items);
      if (state.selection?.type === 'city') render();
      return items;
    }).catch(() => {
      sitePromise = null;
      state.sitesFailed = true;
      if (state.selection?.type === 'city') render();
      notify(msg('设施数据加载失败。可再次打开设施图层。'));
      return [];
    });
  }
  return sitePromise;
}

function loadCities() {
  if (!cityPromise) {
    cityPromise = load('cities.json').then((cities) => {
      state.cities = cities; searchPlaces = null; map.setCities(cities); return cities;
    }).catch((error) => { cityPromise = null; throw error; });
  }
  return cityPromise;
}

function loadDetails() {
  if (!detailPromise) {
    detailPromise = Promise.all([load('outlines.json'), load('water.json'), loadCities()]).then(([outlines,water]) => {
      map.setGeography(outlines,water); map.detailsReady = true;
    }).catch((error) => {
      detailPromise = null; map.detailRequested = false;
      notify(t('地图细节加载失败，请缩放重试。','Map details could not be loaded. Zoom to retry.'));
      throw error;
    });
  }
  return detailPromise;
}

function loadHeritage() {
  if (!heritagePromise) {
    heritagePromise = load('heritage-points.json').then((items) => { state.heritage = items; return items; }).catch((error) => { heritagePromise = null; throw error; });
  }
  return heritagePromise;
}

function setSelection(selection, scroll = false) {
  state.selection = selection;
  map.setSelection(selection);
  render();
  if (selection?.type === 'cell' && !map.detailsReady) void loadDetails().catch(() => {});
  if (selection?.type === 'city') void loadSites();
  if (scroll && window.matchMedia('(max-width:700px)').matches) {
    $('inspector').scrollIntoView({ block: 'start', behavior: 'instant' });
  }
}

function chooseCountry(id, center = true) {
  const country = byId.get(id);
  if (!country) return;
  focusRequest++;
  setSelection({ type: 'country', country });
  if (center) {
    const [west, south, east, north] = country.bounds;
    const span = Math.max(north - south, east - west > 175 ? (north - south) * 1.7 : east - west, 3);
    map.focus(country.lat, country.lon, clamp((map.width || 700) / (span * 1.38), map.minScale || 1, 85));
  }
}

function chooseCity(id, center = true) {
  const city = state.cities.find((item) => item[0] === id);
  if (!city) return;
  focusRequest++;
  if (center) map.focus(city[4], city[5], 59);
  setSelection({ type: 'city', item: city });
}

async function chooseCell(lat, lon, precise = true) {
  const request = ++focusRequest;
  if (precise) map.focus(lat, lon, 77);
  const result = await map.details(lat, lon, precise ? 4 : state.level);
  if (result && request === focusRequest) setSelection(result);
}

function showHover(x, y, label, description) {
  const tip = $('map-tooltip');
  tip.hidden = !label;
  if (!label) return;
  tip.style.left = `${clamp(x + 12, 8, Math.max(8, map.width - 225))}px`;
  tip.style.top = `${clamp(y + 12, 8, Math.max(8, map.height - 60))}px`;
  tip.innerHTML = `<strong dir="auto">${esc(label)}</strong><span>${esc(description)}</span>`;
}

function renderLenses() {
  const container = $('lens-panel');
  const groups = new Map();
  for (const lens of lenses) {
    if (!groups.has(lens.group)) groups.set(lens.group, []);
    groups.get(lens.group).push(lens);
  }
  container.innerHTML = Array.from(groups, ([group, entries]) => `<h3>${esc(group)}</h3><div class="lens-grid">${entries.map((lens) => `<button data-lens="${esc(lens.id)}" aria-pressed="${state.lens.id === lens.id}">${esc(lens.name)}</button>`).join('')}</div>`).join('');
  container.insertAdjacentHTML('beforeend', `<div class="lens-flags">
    <label><input type="checkbox" data-option="grid" checked> ${htmlText('格网')}</label>
    <label><input type="checkbox" data-option="labels" checked> ${htmlText('地名')}</label>
    <label><input type="checkbox" data-option="art" checked> ${htmlText('文明地块绘制')}</label>
    ${SITES.map((name, index) => `<label><input type="checkbox" data-site="${index}"> ${esc(name)}</label>`).join('')}
  </div>`);
}

function showLenses(visible, returnFocus = false) {
  $('lens-button').setAttribute('aria-expanded', String(visible));
  $('lens-panel').hidden = !visible;
  if (visible) $('lens-panel').querySelector('[aria-pressed="true"]')?.focus();
  else if (returnFocus) $('lens-button').focus();
}

function syncOptions() {
  for (const input of $('lens-panel').querySelectorAll('[data-site]')) input.checked = state.options.sites.has(+input.dataset.site);
  map.setOptions(state.options);
  changeLens(state.lens);
  if (state.options.sites.size) void loadSites();
}

function setPlaying(playing) {
  clearInterval(interval);
  interval = null;
  const button = $('play-years');
  const label = msg(playing ? '暂停历史年份' : '播放历史年份');
  button.setAttribute('aria-label', label);
  button.title = label;
  button.firstElementChild.textContent = playing ? 'Ⅱ' : '▶';
  if (!playing) return;
  if (state.year >= atlas.years.at(-1)) changeYear(atlas.years[0]);
  interval = setInterval(() => {
    changeYear(state.year + 1);
    if (state.year === atlas.years.at(-1)) setPlaying(false);
  }, 540);
}

function changeTabs(mode) {
  for (const button of document.querySelectorAll('[data-view]')) {
    const active = button.dataset.view === mode;
    button.classList.toggle('current', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
}

function chooseLanguage(tag) {
  const locale = saveLocalePreference(tag);
  if (!locale || locale === getLocale()) return;
  const url = new URL($('workspace').dataset.ready === 'true' ? mapLink() : location.href);
  url.searchParams.set('lang', locale);
  location.replace(url);
}

const modeTitles = { council: '地方议事', explorer: '数据台', scenario: '百年推演', advisors: '数据顾问', sources: '数据来源与方法', search: '搜索地图', standards: '标准与声明', feedback: '反馈与数据建议', history:'更多研究', space:'更多研究', markets:'更多研究', coverage:'更多研究' };
const REPOSITORY = 'https://github.com/XucroYuri/planet-hex-atlas';

function insertStandards(host, official) {
  host.innerHTML = `
    <p class="method">${htmlText('本图是使用公开数据制作的科学可视化交互地图，不是经自然资源主管部门审核的标准地图，尚未取得审图号，也不作为任何领土主张或边界表达的依据。正式发布标准地图请使用自然资源部标准地图服务。')}</p>
    <div class="source-grid">
      <article><h3>${htmlText('地图审核与标准地图')}</h3><p>${htmlText('《地图管理条例》要求公开的世界地图、历史地图等依法送审。自然资源部提供免费标准地图与审核服务，并说明规范用图需经审核、标准地图可免费下载。')}</p><a href="https://www.ngcc.cn/xwzx/ywcg/202401/t20240103_1233.html" target="_blank" rel="noopener">${htmlText('自然资源部：标准地图服务说明')} ↗</a><br><a href="http://bzdt.ch.mnr.gov.cn/" target="_blank" rel="noopener">${htmlText('标准地图服务系统')} ↗</a><br><a href="http://bzdt.ch.mnr.gov.cn/download.html?superclassName=%E4%B8%96%E7%95%8C%E5%9C%B0%E5%9B%BE" target="_blank" rel="noopener">${htmlText('世界地图标准图幅（37 幅，含审图号）')} ↗</a></article>
      <article><h3>${htmlText('中国官方经济基准')}</h3><p>${htmlText('中国档案优先展示国家统计局的年度 GDP 公告，并区分初步核算、修订与最终核实。跨地区比较仍使用世界银行序列，两个口径不混算。')}</p><a href="https://www.stats.gov.cn/" target="_blank" rel="noopener">${htmlText('国家统计局')} ↗</a></article>
    </div>
    <h3>${htmlText('合规状态')}</h3>
    <div class="detail-list">${[
      [msg('中国省级以上行政区划与规范命名'), msg('已按官方名称与行政层级标注')],
      [msg('全国经济总量中国官方基准'), official ? htmlText('已接入 {n} 个年度官方值', { n: formatCount(Object.keys(official.series).length) }) : msg('未载入')],
      [msg('官方标准地图几何与审图号'), msg('未完成：当前底图来自 Natural Earth，需替换或送审')],
      [msg('中国主张岛礁的权威图幅核对'), msg('未完成：需对照标准地图逐幅核实')],
      [msg('历史与统计缺失显示'), msg('缺失保持为空，不填补')],
    ].map(([label, value]) => `<div><span class="row-label">${esc(label)}</span><span class="row-value">${esc(value)}</span></div>`).join('')}</div>
    <h3>${htmlText('无障碍与键盘操作')}</h3>
    <p class="method">${htmlText('地图、地区档案、标准弹窗与研究页通过 axe-core 的 WCAG A/AA 自动审计。可用 Tab 导航，按 / 打开搜索，按 Esc 关闭弹窗；地图画布可聚焦后用方向键、+/- 缩放与 Enter 选择。界面尊重系统的“减少动态效果”偏好。')}</p>
    <p class="atlas-memo">${htmlText('在取得审图号和权威几何之前，本站不会声称符合中国标准地图；相关检查可重复运行于 pipeline/china_source_audit.py。')}</p>
    <div class="panel-buttons"><button class="panel-action" data-action="feedback">${htmlText('提交数据来源或纠错建议')}</button><a class="panel-action" href="${REPOSITORY}/blob/main/docs/china-standards.md" target="_blank" rel="noopener">${htmlText('查看标准核查记录')} ↗</a><a class="panel-action" href="${REPOSITORY}/tree/main/docs/china-map-submission" target="_blank" rel="noopener">${htmlText('送审路径与材料清单')} ↗</a></div>`;
}

function insertFeedback(host) {
  const categories = [
    ['data', '数据来源或数值纠错'], ['map', '地图标准、区划或命名'], ['feature', '功能建议'], ['other', '其他反馈'],
  ];
  host.innerHTML = `<p class="method">${htmlText('表单只在本机整理内容，点击提交后在 GitHub 打开预填的 issue，由你确认并提交。需要 GitHub 账号；请勿填写个人信息、联系方式或任何凭据。')}</p>
    <form class="feedback-form" novalidate>
      <label>${htmlText('反馈类型')}<select name="category">${categories.map(([v, l]) => `<option value="${v}">${esc(msg(l))}</option>`).join('')}</select></label>
      <label>${htmlText('意见或建议')}<textarea name="message" rows="6" maxlength="1500" required placeholder="${esc(msg('例如：某地人口与官方公报不一致，或某处地名应按规范写法调整。'))}"></textarea></label>
      <label>${htmlText('来源链接（可选）')}<input name="source" type="url" inputmode="url" maxlength="500" placeholder="https://"></label>
      <p class="method" data-role="feedback-status" role="status"></p>
      <div class="panel-buttons"><button type="submit" class="panel-action is-primary">${htmlText('在 GitHub 打开并提交')}</button><a class="panel-action" href="${REPOSITORY}/issues" target="_blank" rel="noopener">${htmlText('查看已有反馈')} ↗</a><a class="panel-action" href="${REPOSITORY}/tree/main/docs/feedback-recommendations" target="_blank" rel="noopener">${htmlText('开发者建议记录')} ↗</a></div>
    </form>`;
  const form = host.querySelector('form');
  const status = form.querySelector('[data-role=feedback-status]');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const message = String(data.get('message') || '').trim();
    if (message.length < 8) { status.textContent = msg('请至少填写 8 个字符，并说明问题所在位置。'); form.querySelector('textarea').focus(); return; }
    const source = String(data.get('source') || '').trim();
    if (source && !/^https?:\/\//i.test(source)) { status.textContent = msg('来源链接必须以 http:// 或 https:// 开头。'); return; }
    const category = categories.find(([id]) => id === data.get('category'))?.[1] ?? '其他反馈';
    const title = `[反馈] ${msg(category)}`;
    const body = `${msg(category)}\n\n${message}\n\n${source ? `来源：${source}\n\n` : ''}提交自寰宇图志网站反馈入口。请勿包含个人信息或凭据。`;
    const url = new URL(`${REPOSITORY}/issues/new`);
    url.searchParams.set('title', title);
    url.searchParams.set('body', body);
    url.searchParams.set('labels', 'feedback');
    status.textContent = msg('正在打开 GitHub，请确认后提交。');
    window.open(url.href, '_blank', 'noopener');
  });
}

async function openDialog(mode) {
  if (!atlas) return;
  setPlaying(false);
  if (!dialog.open) focusBeforeDialog = document.activeElement;
  showLenses(false);
  changeTabs(researchModes.includes(mode) ? 'history' : ['explorer','scenario'].includes(mode) ? mode : 'map');
  $('overlay-title').textContent = researchModes.includes(mode) ? t('更多研究','Research') : msg(modeTitles[mode]);
  dialogRequest?.abort();
  dialogRequest = new AbortController();
  const current = dialogRequest;
  dialog.dataset.mode = mode;
  const body = document.createElement('div');
  dialogBody.replaceChildren(body);
  if (!dialog.open) dialog.showModal();
  if (mode === 'search') { insertSearch(body); void loadCities().then(() => body.querySelector('input')?.dispatchEvent(new Event('input'))).catch(() => notify(t('城市目录加载失败','City index unavailable'))); return; }
  if (mode === 'sources') { renderSources(body, atlas); return; }
  if (mode === 'standards') { insertStandards(body, state.chinaOfficial); return; }
  if (mode === 'feedback') { insertFeedback(body); return; }
  body.textContent = msg('正在载入…');
  if (['explorer', 'scenario', 'council', 'advisors'].includes(mode)) {
    try { await observations.ensureHistory(); }
    catch { if (body.isConnected) body.textContent = msg('模块未能载入。关闭弹窗后重试。'); return; }
    if (current.signal.aborted || !body.isConnected) return;
  }
  const ctx = {
    countries: atlas.countries,
    country: itemCountry() || (['scenario','council'].includes(mode) ? byId.get('CHN') : null),
    metrics: atlas.metrics,
    years: atlas.years,
    year: state.year,
    value,
    locale: getLocale(), t, signal: current.signal,
    onSelect: (id) => { chooseCountry(id); dialog.close(); },
    onLens: (id, year = state.year) => {
      const lens = lenses.find((entry) => entry.id === id);
      if (lens) { state.lens = lens; changeYear(year); }
      dialog.close();
    },
  };
  if (mode === 'advisors') { renderAdvisors(body, ctx); return; }
  body.textContent = msg('正在载入…');
  try {
    if (researchModes.includes(mode)) {
      const { renderResearch } = await import('./research.js');
      if (body.isConnected && !current.signal.aborted) await renderResearch(body, ctx, mode);
      return;
    }
    if (mode === 'explorer') {
      const { renderExplorer } = await import('./explorer.js');
      if (body.isConnected) { body.replaceChildren(); renderExplorer(body, ctx); }
    }
    if (mode === 'council') {
      const { renderCouncil } = await import('./council.js');
      if (body.isConnected) { body.replaceChildren(); renderCouncil(body, ctx); }
    }
    if (mode === 'scenario') {
      const { renderScenario } = await import('./scenario.js');
      if (body.isConnected) {
        body.replaceChildren();
        const switcher = document.createElement('button');
        switcher.className = 'panel-action council-entry';
        switcher.textContent = msg('进入地方议事');
        switcher.onclick = () => void openDialog('council');
        const lab = document.createElement('div');
        body.append(switcher, lab);
        renderScenario(lab, ctx);
      }
    }
  } catch (error) {
    console.error(error);
    body.textContent = msg('模块未能载入。关闭弹窗后重试。');
  }
}

function matchSearch(query) {
  if (!query) return LANDING_CITIES.map((id) => state.cities.find((city) => city[0] === id)).filter(Boolean)
    .map((city) => ({ name: cityName(city), hint: msg('城市'), type: 'city', id: city[0] }));
  searchPlaces ??= [
    ...atlas.countries.map((country) => ({
      names: countrySearchNames(country), name: countryName(country), type: 'country', id: country.id,
      hint: `${msg('地区')} · ${continentName(country.continent)}`, weight: 4,
    })),
    ...state.cities.map((city) => ({
      names: citySearchNames(city), name: cityName(city), type: 'city', id: city[0],
      hint: `${msg('城市')} · ${countryName(byId.get(city[3])) || regionName(city[8]) || city[1]}`,
      weight: Math.min(3, Math.log10(Math.max(1, city[6])) / 3),
    })),
  ];
  const candidates = [];
  function add({ names, name, type, id, hint, weight }) {
    let best = -1;
    for (const text of names) {
      if (text === query) best = Math.max(best, 30);
      else if (text.startsWith(query)) best = Math.max(best, 15);
      else if (text.includes(query)) best = Math.max(best, 3);
    }
    if (best !== -1) candidates.push({ name, type, id, hint, score: best + weight });
  }
  for (const place of searchPlaces) add(place);
  const found = new Set();
  for (const site of state.heritage || []) {
    if (found.has(site[9])) continue;
    found.add(site[9]);
    add({
      names: [site[2], site[8]].map(searchKey), name: siteName(site), type: 'heritage', id: site[0],
      hint: `${SITES[3]} · ${msg(site[7])}`, weight: 1,
    });
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, 14);
}

function insertSearch(host) {
  host.innerHTML = `<label class="search-field"><span class="magnifier" aria-hidden="true"></span><input dir="auto" autocomplete="off" placeholder="${htmlText('输入城市、地区、遗产或地区代码')}" aria-label="${htmlText('搜索城市或地区')}"></label><div class="search-results" aria-live="polite"></div>`;
  const input = host.querySelector('input');
  const results = host.querySelector('.search-results');
  function refresh() {
    const matches = matchSearch(searchKey(input.value));
    results.innerHTML = matches.length ? matches.map(({ name, hint, id, type }) => `<button data-action="search-${type}" data-value="${esc(id)}"><strong dir="auto">${esc(name)}</strong><small>${esc(hint)}</small></button>`).join('') : `<p class="search-empty">${htmlText('没有匹配结果。试试其他名称或地区代码。')}</p>`;
  }
  input.addEventListener('input', refresh);
  input.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); results.querySelector('button')?.focus(); }
    if (event.key === 'Enter') { event.preventDefault(); results.querySelector('button')?.click(); }
  });
  refresh();
  void loadHeritage().then(() => { if (input.isConnected) refresh(); }).catch(() => notify(msg('遗产名录暂未载入')));
  input.focus();
}

function mapLink() {
  const params = new URLSearchParams({ lens: state.lens.id, year: String(state.year), projection: map.projection });
  const { lat, lon, scale } = map.camera;
  params.set('view', [lat.toFixed(4), lon.toFixed(4), scale.toFixed(3)].join(','));
  const picked = state.selection;
  if (picked?.type === 'country') params.set('region', picked.country.id);
  if (picked?.type === 'city') params.set('city', picked.item[0]);
  if (picked?.type === 'cell') params.set('cell', [picked.lat.toFixed(5), picked.lon.toFixed(5), picked.level].join(','));
  if (picked?.type === 'site' && picked.item[0]) params.set('site', `${picked.item[1]},${picked.item[0]}`);
  if (state.options.sites.size) params.set('sites', [...state.options.sites].join(','));
  if (!state.options.grid) params.set('grid', '0');
  if (!state.options.labels) params.set('labels', '0');
  if (!state.options.art) params.set('art', '0');
  const url = new URL(location.href);
  url.searchParams.set('lang', getLocale());
  url.hash = params.toString();
  return url.href;
}

async function share() {
  const url = mapLink();
  try { await navigator.clipboard.writeText(url); notify(msg('当前地图链接已复制')); }
  catch {
    focusBeforeDialog = document.activeElement;
    $('overlay-title').textContent = msg('分享当前地图');
    dialog.dataset.mode = 'search';
    dialogBody.innerHTML = `<label class="search-field"><input dir="ltr" readonly aria-label="${htmlText('当前地图链接')}"></label>`;
    const input = dialogBody.querySelector('input');
    input.value = url;
    dialog.showModal();
    input.focus();
    input.select();
  }
}

async function restoreLink() {
  if (!location.hash) return;
  const args = new URLSearchParams(location.hash.slice(1));
  const lens = lenses.find((item) => item.id === args.get('lens'));
  const year = readNumber(args.get('year'));
  if (lens) state.lens = lens;
  await changeYear(year == null ? state.year : Math.round(year));
  if (args.has('city')) await loadCities().catch(() => {});
  const view = args.get('view')?.split(',').map(readNumber);
  if (view?.length === 3 && view.every(Number.isFinite)) {
    await new Promise(requestAnimationFrame);
    map.focus(...view, args.get('projection') === 'globe' ? 'globe' : 'flat');
  }
  state.options.grid = args.get('grid') !== '0';
  state.options.labels = args.get('labels') !== '0';
  state.options.art = args.get('art') !== '0';
  state.options.sites = new Set((args.get('sites') || '').split(',').filter(Boolean).map(Number).filter((id) => [0,1,2,3].includes(id)));
  for (const input of $('lens-panel').querySelectorAll('[data-option]')) input.checked = state.options[input.dataset.option];
  syncOptions();
  if (args.has('region')) chooseCountry(args.get('region'), !view);
  if (args.has('city')) chooseCity(args.get('city'), !view);
  const cell = args.get('cell')?.split(',').map(readNumber);
  if (cell?.length === 3 && cell.every(Number.isFinite) && [2,3,4].includes(cell[2])) {
    const hit = await map.details(cell[0], cell[1], cell[2]);
    if (hit) setSelection(hit);
  }
  if (args.has('site')) {
    const [type, ...parts] = args.get('site').split(',');
    const sites = await loadSites();
    const item = sites.find((site) => site[0] === parts.join(',') && String(site[1]) === type);
    if (item) setSelection({ type: 'site', item });
  }
  const mode = args.get('mode');
  if (['explorer', 'scenario', 'council', 'sources', 'advisors', ...researchModes].includes(mode)) await openDialog(mode);
}

function bind() {
  $('lens-button').onclick = () => showLenses($('lens-panel').hidden, true);
  $('lens-panel').addEventListener('click', (event) => {
    const id = event.target.closest('[data-lens]')?.dataset.lens;
    if (!id) return;
    changeLens(lenses.find((lens) => lens.id === id));
    showLenses(false, true);
  });
  $('lens-panel').addEventListener('change', (event) => {
    const { site, option } = event.target.dataset;
    if (option) state.options[option] = event.target.checked;
    if (site !== undefined) event.target.checked ? state.options.sites.add(+site) : state.options.sites.delete(+site);
    syncOptions();
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.map-tools') && !$('lens-panel').hidden) showLenses(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('lens-panel').hidden) showLenses(false, true);
    if (event.key === '/' && !dialog.open && !event.target.closest('input,select,textarea,[contenteditable]')) { event.preventDefault(); void openDialog('search'); }
  });
  $('year').addEventListener('input', (event) => { setPlaying(false); changeYear(+event.target.value); });
  $('play-years').onclick = () => setPlaying(!interval);
  $('launch-search').onclick = () => void openDialog('search');
  $('show-sources').onclick = () => void openDialog('sources');
  $('zoom-in').onclick = () => map.zoom(1.65);
  $('zoom-out').onclick = () => map.zoom(1 / 1.65);
  $('world-view').onclick = () => { map.setProjection('globe'); setSelection(null); };
  $('projection').onclick = () => map.setProjection(map.projection === 'globe' ? 'flat' : 'globe');
  $('share').onclick = () => void share();
  $('close-overlay').onclick = () => dialog.close();
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    dialogRequest?.abort();
    changeTabs('map');
    dialogBody.replaceChildren();
    if (focusBeforeDialog?.isConnected) focusBeforeDialog.focus({ preventScroll: true });
  });
  document.querySelector('.views').addEventListener('click', (event) => {
    const mode = event.target.closest('[data-view]')?.dataset.view;
    if (mode === 'map') { if (dialog.open) dialog.close(); else canvas.focus({ preventScroll: true }); }
    else if (mode) void openDialog(mode);
  });
  const selectAction = (event) => {
    const action = event.target.closest('button[data-action]');
    if (!action) return;
    const { action: name, value } = action.dataset;
    if (name === 'clear') setSelection(null);
    else if (name === 'heritage' || name === 'search-heritage') {
      const site = state.heritage?.find((record) => record[0] === value);
      if (site) { map.focus(site[4], site[5], 66); state.options.sites.add(3); syncOptions(); setSelection({ type: 'site', item: site }); }
    }
    else if (name === 'city' || name === 'search-city') chooseCity(value);
    else if (name === 'country' || name === 'search-country') chooseCountry(value);
    else if (name === 'fine-cell') void chooseCell(...value.split(',').map(Number));
    else if (name === 'show-sites') { state.options.sites = new Set([0,1,2,3]); syncOptions(); }
    else if (name === 'lens') { changeLens(lenses.find((entry) => entry.id === value)); dialog.close(); }
    else if (Object.hasOwn(modeTitles, name)) void openDialog(name);
    if (name.startsWith('search-')) dialog.close();
  };
  $('inspector').addEventListener('click', selectAction);
  dialogBody.addEventListener('click', selectAction);
}

async function init() {
  await loadLocalePack();
  localizePage(document);
  for (const mark of $('timeline-marks').children) mark.textContent = formatYear(Number(mark.textContent));
  $('year-label').textContent = formatYear(state.year);
  $('language').onchange = ({ target }) => chooseLanguage(target.value);
  try {
    atlas = await load('atlas.json');
    atlas = { ...atlas, metrics: atlas.metrics.map(localizeMetric) };
    byId = new Map(atlas.countries.map((row) => [row.id, row]));
    lenses = [...LOCAL_LENSES, ...atlas.metrics];
    state.year = atlas.year;
    observations = createObservationStore(load, atlas.years[0], atlas.years.at(-1));
    map = new AtlasMap(canvas, atlas, summarizeMap, (result) => { focusRequest++; setSelection(result, true); }, showHover, notify);
    map.onDetailNeeded = loadDetails;
    map.onScale = (classifier) => renderLegend(classifier, state.lens, new Map());
    renderLenses();
    bind();
    const [official, missingNotes] = await Promise.all([load('china-official.json'), load('missing-notes.json')]);
    state.chinaOfficial = official;
    state.missingNotes = missingNotes;
    // Paint the inspector and map theme from the smaller annual payload first; the
    // larger overview (cities, coastlines, water) arrives after first paint.
    await changeYear(atlas.year);
    const overview = await load('overview.json');
    state.cities = overview.cities;
    map.setGeography(overview.outlines, overview.water);
    map.setCities(overview.cities);
    await restoreLink();
    window.addEventListener('hashchange', () => {
      setSelection(null);
      if (location.hash) void restoreLink();
      else { map.setProjection('globe'); changeYear(atlas.year); }
    });
    $('map-status').hidden = true;
    $('workspace').dataset.ready = 'true';
  } catch (error) {
    console.error(error);
    $('map-status').textContent = msg('图谱未能加载。请刷新页面重试。');
  }
}

void init();
