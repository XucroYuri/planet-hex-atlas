import { CONTINENTS, LANDING_CITIES, SITES, TILE_KM, coordinates, distanceKm, esc, format } from './data.js';

const cityName = (city) => city[2] || city[1];
const compactNumber = (value, unit = '') => format(value, unit, true);
const count = (value) => format(value);

function stat(label, value, subtitle = '') {
  return `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</div>`;
}
function row(label, value) { return `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`; }
function button(label, key, value = '', primary = false) {
  return `<button class="panel-action${primary ? ' is-primary' : ''}" data-action="${key}" data-value="${esc(value)}">${esc(label)}</button>`;
}
function header(tag, heading, description, code, close = true) {
  return `<div class="section-tag"><span>${esc(tag)}</span>${code ? `<code>${esc(code)}</code>` : ''}${close ? '<button class="close-inspector" data-action="clear" aria-label="返回世界概览">返回 ↗</button>' : ''}</div><h1 class="inspector-heading">${esc(heading)}</h1><p class="deck">${esc(description)}</p>`;
}
function yields(id, year, value) {
  const gdp = value(id, 'gdp', year);
  const research = value(id, 'research', year);
  const science = Number.isFinite(gdp) && Number.isFinite(research) ? gdp * research / 100 : null;
  return `<section class="inspector-section"><h3>${year} 年产出账簿</h3><dl class="detail-list">${row('粮食 · 谷物产量', compactNumber(value(id, 'grain', year), '吨'))}${row('金币 · 名义 GDP', compactNumber(gdp, '美元'))}${row('工坊 · 制造业增加值', compactNumber(value(id, 'manufacture', year), '美元'))}${row('科学 · 研发支出估算', compactNumber(science, '美元'))}</dl><small class="micro">研发支出按同年 GDP × 研发支出占比计算。</small></section>`;
}

function quickCity(city) {
  return `<button data-action="city" data-value="${esc(city[0])}"><span>${esc(cityName(city))}</span><span aria-hidden="true">↗</span></button>`;
}

export function renderInspector(host, ctx) {
  const { atlas, selection, year, value, cities, sites, lens } = ctx;
  const findCountry = (id) => ctx.byId.get(id);
  const people = (id) => compactNumber(value(id, 'pop', year), '人');
  const economy = (id) => compactNumber(value(id, 'gdp', year), '美元');
  let content;
  if (!selection) {
    const counts = atlas.counts;
    const featured = LANDING_CITIES.map((id) => cities.find((c) => c[0] === id)).filter(Boolean);
    content = header('全球图谱', '世界概览', '从地球全景缩放到一格，查看地形、人口与城市。', 'H3 · WGS 84', false);
    content += `<dl class="atlas-stats">${stat('世界人口', people('WLD'), `${year} · 世界银行`)}${stat('六角格', count(counts.cells), 'H3 R4 · 平均边长 26 公里')}${stat('地图地域', count(counts.regions), '含国家与地区')}${stat('城市与居民点', count(counts.cities), 'GeoNames')}</dl>`;
    if (featured.length) content += `<section class="inspector-section"><h3>从一座城市开始</h3><div class="quick-list">${featured.map(quickCity).join('')}</div></section>`;
    content += `<section class="inspector-section"><h3>比较地区与时间</h3><div class="panel-buttons">${button('打开数据台', 'explorer', '', true)}${button('九组数据顾问', 'advisors')}${button('地方议事', 'council')}</div></section><p class="atlas-memo">点击城市或格网查看档案。观测年份会更新国家与地区指标，独立数据集的年份见各档案。</p>`;
    content += yields('WLD', year, value);
  } else if (selection.type === 'country') {
    const c = selection.country;
    const features = cities.filter((city) => city[3] === c.id).slice(0, 6);
    content = header('地区档案', c.zh, `${c.name} · ${CONTINENTS[c.continent] || c.continent}`, c.id);
    content += `<dl class="atlas-stats">${stat('人口', people(c.id), `${year} · 世界银行`)}${stat('经济总量', economy(c.id), `${year} · 名义 GDP`)}${stat('预期寿命', format(value(c.id, 'life', year), '岁'), `${year} · 世界银行`)}${stat('电力可及率', format(value(c.id, 'electric', year), '%'), `${year} · 世界银行`)}</dl>`;
    if (lens.code) content += `<dl class="detail-list">${row(lens.name, compactNumber(value(c.id, lens.id, year), lens.unit))}</dl>`;
    if (features.length) content += `<section class="inspector-section"><h3>主要居民点</h3><div class="quick-list">${features.map(quickCity).join('')}</div></section>`;
    content += `<div class="panel-buttons">${button('比较历史指标', 'explorer', '', true)}${button('以此地为推演起点', 'scenario')}${button('查看顾问', 'advisors')}</div>`;
    content += yields(c.id, year, value);
    if (!c.wdi) content += '<p class="atlas-memo">世界银行的年度表没有可单独匹配到此地的统计序列。格网和地点档案仍可浏览。</p>';
  } else if (selection.type === 'cell') {
    const { cell, level, country, lat, lon } = selection;
    const area = h3.cellArea(cell.id, 'km2');
    const land = cell.land > 0;
    const elevation = cell.elevation;
    content = header('格网档案', land ? (country?.zh || '陆地格网') : '海洋格网', coordinates(cell.lat, cell.lon), `H3 R${level}`);
    content += `<dl class="atlas-stats">${stat('格网人口', compactNumber(Math.round(cell.pop), '人'), 'GHSL · 2020')}${stat(level === 4 ? '中心高程' : '平均高程', format(elevation, '米'), 'GMT / SRTM15+')}${stat('格网面积', format(Math.round(area), 'km²'), 'H3 球面面积')}${stat('陆地比例', format(Math.round(cell.land * 100), '%'), '7 点抽样估计')}</dl>`;
    content += `<section class="inspector-section"><h3>地块与邻近地点</h3><dl class="detail-list">${row('主要生态带', land ? atlas.biomes[cell.biome]?.[0] || '无分类' : '海洋')}${row('人口 / 整格面积', format(cell.pop / area, '人/km²'))}${row('格网编号', cell.id)}</dl></section>`;
    const nearby = cities.filter((city) => Math.abs(city[4]-cell.lat) < .8 && distanceKm(cell.lat, cell.lon, city[4], city[5]) <= 85).slice(0, 4);
    if (nearby.length) content += `<div class="quick-list" style="margin-top:10px">${nearby.map(quickCity).join('')}</div>`;
    content += `<div class="panel-buttons">${level < 4 ? button('查看 26 公里格网', 'fine-cell', `${lat},${lon}`, true) : ''}${country && land ? button(`打开${country.zh}档案`, 'country', country.id) : ''}</div>`;
  } else if (selection.type === 'city') {
    const city = selection.item;
    const c = findCountry(city[3]);
    const nearby = sites?.filter((site) => Math.abs(site[4]-city[4]) < 1 && distanceKm(city[4], city[5], site[4], site[5]) <= 100);
    const totals = [0, 0, 0, 0];
    const waiting = ctx.sitesFailed ? '加载失败' : '载入中';
    const fuels = new Map();
    for (const site of nearby || []) {
      totals[site[1]]++;
      if (site[1] === 2) fuels.set(site[7], (fuels.get(site[7]) || 0) + site[6]);
    }
    const top = [...fuels].sort((a,b) => b[1]-a[1])[0];
    content = header('城市档案', cityName(city), [city[2] ? city[1] : '', c?.zh || (city[8] ? new Intl.DisplayNames(['zh-CN'], { type: 'region' }).of(city[8]) : ''), coordinates(city[4], city[5])].filter(Boolean).join(' · '), `GEO ${city[0]}`);
    content += `<dl class="atlas-stats">${stat('居民点人口', city[6] ? compactNumber(city[6], '人') : '无记录', 'GeoNames · 居民点口径')}${stat('邻近发电站', nearby ? count(totals[2]) : waiting, 'WRI · 100 公里半径')}${stat('邻近港口', nearby ? count(totals[0]) : waiting, 'Natural Earth · 100 公里')}${stat('邻近定期航班机场', nearby ? count(totals[1]) : waiting, 'OurAirports · 100 公里')}</dl>`;
    content += `<section class="inspector-section"><h3>城市周边</h3><dl class="detail-list">${row('最大装机能源类型', top ? `${top[0]} · ${compactNumber(top[1], 'MW')}` : '无记录')}${row('行政属性', city[7] ? '首都／行政中心' : '居民点')}${row('统计范围', '城市中心周边 100 公里')}</dl></section>`;
    if (nearby) {
      const districts = [[totals[0], '港务区', '港口'], [totals[1], '航空区', '定期航班机场'], [totals[2], '能源区', '发电站'], [totals[3], '遗产区', '遗产组件']].filter(([total]) => total > 0);
      if (districts.length) content += `<section class="inspector-section"><h3>文明城区</h3><div class="districts">${districts.map(([n,name,type]) => `<span>${name}<small>${n} 个${type}</small></span>`).join('')}</div><p class="atlas-memo">100 公里内有对应记录即显示该城区。图块建筑为人口等级示意。</p></section>`;
    }
    const wonders = (nearby || []).filter((entry) => entry[1] === 3);
    const uniqueWonders = [...new Map(wonders.map((site) => [site[9], site])).values()];
    if (uniqueWonders.length) content += `<section class="inspector-section"><h3>附近世界遗产</h3><div class="quick-list">${uniqueWonders.slice(0,4).map((site) => button(site[2], 'heritage', site[0])).join('')}</div></section>`;
    content += `<div class="panel-buttons">${button('在地图显示周边设施', 'show-sites', '', true)}${c ? button(`打开${c.zh}档案`, 'country', c.id) : ''}${button('查看城市所在格', 'fine-cell', `${city[4]},${city[5]}`)}</div>`;
  } else {
    const site = selection.item;
    const c = findCountry(site[3]);
    content = header('基础设施档案', site[2], [c?.zh, coordinates(site[4], site[5])].filter(Boolean).join(' · '), SITES[site[1]]);
    if (site[1] === 3) {
      content += `<dl class="atlas-stats">${stat('遗产类别', site[7], 'UNESCO')}${stat('列入年份', site[6], `组件 ${site[10]} / ${site[11]}`)}</dl><p class="atlas-memo">${esc(site[8])}</p><div class="panel-buttons"><a class="panel-action" href="https://whc.unesco.org/en/list/${encodeURIComponent(site[9])}/" rel="noopener" target="_blank">UNESCO 遗产档案 ↗</a>${button('查看遗产所在格', 'fine-cell', `${site[4]},${site[5]}`)}</div>`;
      host.innerHTML = content;
      return;
    }
    const types = ['Natural Earth', 'OurAirports', 'WRI GPPD v1.3.0'];
    content += `<dl class="atlas-stats">${stat('设施类型', SITES[site[1]], types[site[1]])}${stat(site[1] === 2 ? '名义装机' : '设施编号', site[1] === 2 ? compactNumber(site[6], 'MW') : (site[7] || site[0] || '无编号'), site[1] === 2 ? site[7] : '')}</dl>`;
    content += `<div class="panel-buttons">${button('查看设施所在格', 'fine-cell', `${site[4]},${site[5]}`, true)}${c ? button(`打开${c.zh}档案`, 'country', c.id) : ''}</div>`;
  }
  host.innerHTML = content;
}

const advisors = [
  ['人口', 'pop', '从人口总量与劳动年龄人口看地区规模和年龄结构。'],
  ['经济', 'income', '比较不同经济体的人均产出，核对汇率与观察年份。'],
  ['产业', 'industry', '对照工业、农业与服务业增加值份额。'],
  ['贸易', 'trade', '观察进出口总量占 GDP 的比例，小型经济体可能超过 100%。'],
  ['健康', 'life', '用预期寿命观察总体生存状况，结合卫生支出比较。'],
  ['教育与连接', 'school', '检查中学注册与互联网使用的覆盖差异。'],
  ['能源', 'electric', '结合电力可及率、可再生能源占比和名义装机。'],
  ['环境', 'co2', '比较人均排放、森林覆盖和格网的自然生态带。'],
  ['聚居与基础设施', 'urban', '查看城市人口比例及居民点周边机场、港口与电厂。'],
];

export function renderAdvisors(host, ctx) {
  const place = ctx.country?.zh || '世界';
  const code = ctx.country?.id || 'WLD';
  host.innerHTML = `<p class="method">${esc(place)} · ${ctx.year} 年。选择一个议题切换地图着色，可在数据台对照其他地区与历史年份。</p><div class="source-grid">${advisors.map(([title, id, copy]) => {
    const metric = ctx.metrics.find((m) => m.id === id);
    const value = ctx.value(code, id, ctx.year);
    return `<article><h3>${title}</h3><p>${copy}</p><p>${esc(metric.name)} · <strong>${esc(compactNumber(value, metric.unit))}</strong></p>${button('在图谱查看', 'lens', id)}</article>`;
  }).join('')}</div>`;
}

export function renderSources(host, atlas) {
  const items = [
    ['Natural Earth', '1:10m 国界、港口、城市译名与 1:50m 河湖，公共领域。地域以地图数据集的几何要素计数。', 'https://www.naturalearthdata.com/about/terms-of-use/'],
    ['GHSL · 欧洲委员会联合研究中心', 'GHS-POP R2023A，2020 年、Mollweide 投影、1 公里人口估算。像素中心随人数归入所在 H3 格。', 'https://human-settlement.emergency.copernicus.eu/ghs_pop2023.php'],
    ['GMT / SRTM15+ 与极区补充数据', '六角格中心高程和海底深度、地形底图，采用 6 弧分全球格网。', 'https://www.generic-mapping-tools.org/remote-datasets/earth-relief.html'],
    ['RESOLVE Ecoregions 2017', '陆域生态区提供主要生态带。数据按 CC BY 4.0 使用。', 'https://ecoregions.appspot.com/'],
    ['世界银行 · World Development Indicators', '保留各经济体各年份的原始报告值。无记录的年份和地域显示缺失，世界合计使用 WLD 序列。须通过指标元数据了解来源和特殊条款。', 'https://datatopics.worldbank.org/world-development-indicators/'],
    ['GeoNames', '居民点位置、人口和别名，按 CC BY 4.0 使用。选取达到 4.2 万人口的居民点、首都及每个源数据双字母地域代码的前六名。各地居民点口径可能不同。', 'https://www.geonames.org/export/'],
    ['OurAirports', '定期航班中的大、中型机场，公共领域数据。', 'https://ourairports.com/data/'],
    ['WRI Global Power Plant Database', 'v1.3.0，CC BY 4.0。位置、燃料和名义装机反映数据库发布时点。', 'https://datasets.wri.org/dataset/globalpowerplantdatabase'],
    ['UNESCO 世界遗产名录', '从 WHC001 提取名称、年份、分类和名录组件坐标。衍生坐标表以相同的 CC BY-SA 4.0 许可提供；复合遗产在地图上可能有多个点。', 'https://data.unesco.org/explore/dataset/whc001/'],
    ['H3', '球面分层格网，R2、R3、R4 随缩放切换。R4 平均边长约 26 公里。', 'https://h3geo.org/docs/core-library/restable/'],
    ['usaciv · Andrej Karpathy', '沿用 Python 与 Canvas 2D 的组合，并以 MIT 许可复用城市、地形、港口和机场的绘制代码。建筑表示数据等级，轮廓为示意。', 'https://karpathy.ai/usaciv/'],
  ];
  host.innerHTML = `<p class="method">地图边界沿用 Natural Earth。国家或地区层以面状着色表示同一统计单位的观测。格网人口来自单独的 ${atlas.gridYear} 年估算，与世界银行年度合计的口径有差异。R2/R3 人口按 H3 父子关系聚合。</p><div class="source-grid">${items.map(([name, text, url]) => `<article><h3>${esc(name)}</h3><p>${esc(text)}</p><a href="${url}" target="_blank" rel="noopener">查看数据与条款 ↗</a></article>`).join('')}</div><p class="method">年度指标和事件推演分别使用观测数据与公开模型假设。推演计算运行在你的浏览器中。</p><div class="panel-buttons"><a class="panel-action" href="./data/atlas.json" download="orbis-atlas-sources.json">下载指标与来源清单</a><a class="panel-action" href="./data/ATTRIBUTION.txt" target="_blank" rel="noopener">完整署名与许可</a><a class="panel-action" href="./data/source-lock.json" download>下载源文件校验值</a></div>`;
}
