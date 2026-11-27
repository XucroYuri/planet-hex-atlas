import { AtlasMap } from './map.js';
import { CONTINENTS, LANDING_CITIES, LOCAL_LENSES, SITES, TERRAIN, TILE_KM, clamp, coordinates, esc, format, lensRange, load, ramp } from './data.js';
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
let focusBeforeDialog;
let focusRequest = 0;

const value = (id, metric, year) => state.observations[id]?.[metric]?.[year - atlas.years[0]] ?? null;
const itemCountry = () => state.selection?.country || byId.get(state.selection?.item?.[3]) || null;
const displayCity = (c) => c[2] || c[1];

function notify(message) {
  const toast = $('map-toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
}

function render() {
  renderInspector($('inspector'), { ...state, atlas, byId, value });
}

function changeLens(lens) {
  state.lens = lens;
  $('lens-label').textContent = lens.name;
  const range = lensRange(lens, atlas.countries, value, state.year);
  const values = new Map();
  if (lens.code) for (const country of atlas.countries) values.set(country.id, value(country.id, lens.id, state.year));
  map.setLens(lens, range, values);
  renderLegend(range, values);
  for (const button of $('lens-panel').querySelectorAll('[data-lens]')) button.setAttribute('aria-pressed', String(button.dataset.lens === lens.id));
  $('time-note').textContent = lens.code ? '着色按同一观测年份' : `格网人口固定为 ${atlas.gridYear} 年估算`;
  render();
}

function renderLegend(range, countryValues) {
  const { lens, year, options } = state;
  const legend = $('legend');
  if (lens.id === 'terrain' || lens.id === 'biome') {
    const colors = lens.id === 'terrain'
      ? [['#5c8799', '海洋'], ['#6e957c', '低地'], ['#c7a77d', '高地'], ['#d8e2d8', '冰盖']]
      : [1, 3, 6, 7, 11, 13, 15].map((key) => atlas.biomes[key]).map(([label, color]) => [color, label]);
    if (lens.id === 'terrain') colors.push(['#fbdb92', '城市']);
    for (const index of options.sites) colors.push([['#7bd4d7', '#f1ead4', '#eead69', '#e7a7a8'][index], SITES[index]]);
    legend.innerHTML = `<div class="legend-title">${esc(lens.id === 'terrain' ? '地形与居民点' : '主要生态带')}</div><div class="legend-keys">${colors.map(([color, label]) => `<span><i style="--key:${color}"></i>${esc(label)}</span>`).join('')}</div>`;
    return;
  }
  const [min, max] = range;
  const low = lens.scale === 'total' ? 0 : min;
  const suffix = lens.code ? ` · ${year}` : ['gridPop', 'density'].includes(lens.id) ? ` · ${atlas.gridYear}` : '';
  const measured = lens.code ? [...countryValues.values()].filter(Number.isFinite).length : null;
  const label = (n) => format(n, lens.unit, true);
  legend.innerHTML = `<div class="legend-title">${esc(lens.name + suffix)}</div><div class="legend-bar" style="background:linear-gradient(90deg,${ramp(lens).join(',')})"></div><div class="legend-sub"><span>${esc(label(low))}</span><span>${esc(label(max))}${lens.code && lens.scale !== 'percent' ? ' +' : ''}</span></div>${lens.code ? `<div class="legend-sub"><span>${measured}/${atlas.countries.length} 地域有数据</span><span>灰色为缺失</span></div>` : ''}`;
}

function changeYear(year) {
  state.year = clamp(year, atlas.years[0], atlas.years.at(-1));
  $('year').value = state.year;
  $('year-label').textContent = state.year;
  changeLens(state.lens);
}

function summarizeMap(camera, level) {
  state.level = level;
  const flat = map?.projection === 'flat';
  $('projection').textContent = flat ? '球面' : '展图';
  $('projection').setAttribute('aria-label', flat ? '切换为球面' : '切换为平面地图');
  $('bearing').textContent = coordinates(camera.lat, camera.lon);
  $('scale-indicator').textContent = `H3 R${level} · ${TILE_KM[level]} km`;
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
      notify('设施数据加载失败。可再次打开设施图层。');
      return [];
    });
  }
  return sitePromise;
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
  tip.innerHTML = `<strong>${esc(label)}</strong><span>${esc(description)}</span>`;
}

function renderLenses() {
  const container = $('lens-panel');
  const groups = new Map();
  for (const lens of lenses) {
    if (!groups.has(lens.group)) groups.set(lens.group, []);
    groups.get(lens.group).push(lens);
  }
  container.innerHTML = Array.from(groups, ([group, entries]) => `<h3>${esc(group)}</h3><div class="lens-grid">${entries.map((lens) => `<button data-lens="${esc(lens.id)}" aria-pressed="${state.lens.id === lens.id}">${esc(lens.name)}</button>`).join('')}</div>`).join('');
  container.insertAdjacentHTML('beforeend', `<div class="lens-flags"><label><input type="checkbox" data-option="grid" checked> 格网</label><label><input type="checkbox" data-option="labels" checked> 地名</label><label><input type="checkbox" data-option="art" checked> 文明地块绘制</label>${SITES.map((name, i) => `<label><input type="checkbox" data-site="${i}"> ${name}</label>`).join('')}</div>`);
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
  const label = playing ? '暂停历史年份' : '播放历史年份';
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

const modeTitles = { council: '地方议事', explorer: '数据台', scenario: '百年推演', advisors: '数据顾问', sources: '数据来源与方法', search: '搜索地图' };

async function openDialog(mode) {
  if (!atlas) return;
  setPlaying(false);
  focusBeforeDialog = document.activeElement;
  showLenses(false);
  changeTabs(['explorer','scenario'].includes(mode) ? mode : 'map');
  $('overlay-title').textContent = modeTitles[mode];
  dialog.dataset.mode = mode;
  const body = document.createElement('div');
  dialogBody.replaceChildren(body);
  if (!dialog.open) dialog.showModal();
  if (mode === 'search') { insertSearch(body); return; }
  if (mode === 'sources') { renderSources(body, atlas); return; }
  const ctx = {
    countries: atlas.countries,
    country: itemCountry() || (['scenario','council'].includes(mode) ? byId.get('CHN') : null),
    metrics: atlas.metrics,
    years: atlas.years,
    year: state.year,
    value,
    onSelect: (id) => { chooseCountry(id); dialog.close(); },
    onLens: (id, year = state.year) => {
      const lens = lenses.find((entry) => entry.id === id);
      if (lens) { state.lens = lens; changeYear(year); }
      dialog.close();
    },
  };
  if (mode === 'advisors') { renderAdvisors(body, ctx); return; }
  body.textContent = '正在载入…';
  try {
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
        switcher.textContent = '进入地方议事 →';
        switcher.onclick = () => void openDialog('council');
        const lab = document.createElement('div');
        body.append(switcher, lab);
        renderScenario(lab, ctx);
      }
    }
  } catch (error) {
    console.error(error);
    body.textContent = '模块未能载入。关闭弹窗后重试。';
  }
}

function matchSearch(query) {
  if (!query) return LANDING_CITIES.map((id) => state.cities.find((city) => city[0] === id)).filter(Boolean).map((city) => ({ name: displayCity(city), hint: '城市', type: 'city', id: city[0] }));
  const candidates = [];
  function add(names, name, type, id, hint, weight = 0) {
    let best = -1;
    for (const raw of names) {
      const text = raw.toLocaleLowerCase();
      if (text === query) best = Math.max(best, 30);
      else if (text.startsWith(query)) best = Math.max(best, 15);
      else if (text.includes(query)) best = Math.max(best, 3);
    }
    if (best !== -1) candidates.push({ name, type, id, hint, score: best + weight });
  }
  for (const c of atlas.countries) add([c.zh, c.name, c.id, c.iso2], c.zh, 'country', c.id, `地区 · ${CONTINENTS[c.continent] || c.continent}`, 4);
  for (const c of state.cities) add([c[1], c[2]], displayCity(c), 'city', c[0], `城市 · ${byId.get(c[3])?.zh || c[1]}`, Math.min(3, Math.log10(Math.max(1,c[6])) / 3));
  const found = new Set();
  for (const site of state.heritage || []) {
    if (found.has(site[9])) continue;
    found.add(site[9]);
    add([site[2], site[8]], site[2], 'heritage', site[0], `世界遗产 · ${site[7]}`, 1);
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, 14);
}

function insertSearch(host) {
  host.innerHTML = '<label class="search-field"><span class="magnifier" aria-hidden="true"></span><input autocomplete="off" placeholder="输入城市、地区、遗产或地区代码" aria-label="搜索城市或地区"></label><div class="search-results" aria-live="polite"></div>';
  const input = host.querySelector('input');
  const results = host.querySelector('.search-results');
  function refresh() {
    const matches = matchSearch(input.value.trim().toLocaleLowerCase());
    results.innerHTML = matches.length ? matches.map(({ name, hint, id, type }) => `<button data-action="search-${type}" data-value="${esc(id)}"><strong>${esc(name)}</strong><small>${esc(hint)}</small></button>`).join('') : '<p class="search-empty">没有匹配结果。试试其他名称或地区代码。</p>';
  }
  input.addEventListener('input', refresh);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); results.querySelector('button')?.focus(); }
    if (event.key === 'Enter') { event.preventDefault(); results.querySelector('button')?.click(); }
  });
  refresh();
  void loadHeritage().then(() => { if (input.isConnected) refresh(); }).catch(() => notify('遗产名录暂未载入'));
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
  url.hash = params.toString();
  return url.href;
}

async function share() {
  const url = mapLink();
  try { await navigator.clipboard.writeText(url); notify('当前地图链接已复制'); }
  catch {
    $('overlay-title').textContent = '分享当前地图';
    dialog.dataset.mode = 'search';
    dialogBody.innerHTML = '<label class="search-field"><input readonly aria-label="当前地图链接"></label>';
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
  changeYear(year == null ? state.year : Math.round(year));
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
  if (['explorer', 'scenario', 'council', 'sources', 'advisors'].includes(mode)) await openDialog(mode);
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
    else if (modeTitles[name]) void openDialog(name);
    if (name.startsWith('search-')) dialog.close();
  };
  $('inspector').addEventListener('click', selectAction);
  dialogBody.addEventListener('click', selectAction);
}

async function init() {
  try {
    atlas = await load('atlas.json');
    byId = new Map(atlas.countries.map((row) => [row.id, row]));
    lenses = [...LOCAL_LENSES, ...atlas.metrics];
    state.year = atlas.year;
    map = new AtlasMap(canvas, atlas, summarizeMap, (result) => { focusRequest++; setSelection(result, true); }, showHover, notify);
    renderLenses();
    bind();
    const [outlines, water, cities, observations] = await Promise.all([
      load('outlines.json'), load('water.json'), load('cities.json'), load('observations.json'), map.getTile(2, 'world'),
    ]);
    map.setGeography(outlines, water);
    state.cities = cities;
    state.observations = observations;
    map.setCities(cities);
    changeYear(atlas.year);
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
    $('map-status').textContent = '图谱未能加载。请刷新页面重试。';
  }
}

void init();
