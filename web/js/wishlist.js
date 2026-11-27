import { esc, load, localizeMetric } from './data.js';

// Every entry states a useful acquisition route and a testable condition for admitting the next dataset.
const backlog = [
  ['history','早期人类与考古地点','Early humans and archaeological sites','已接入有正式测年论文的证据点；同一时期的全球逐年人口与经济记录无法直接观测。','Dated archaeological evidence is included. Annual global population and economic observations are unavailable for these periods.','补充可开放的分层、年代区间与地理误差；保存校准方法和来源，不将单个遗址外推为全球序列。','Add reusable site strata, date intervals and spatial uncertainty with calibration and citations. Keep site evidence at site scale.','Neotoma Paleoecology Database','https://www.neotomadb.org/'],
  ['history','历史政体、边界与制度','Historical polities, borders and institutions','现代边界下整理的历史人口不能代表当时国家的疆域。','Historical estimates grouped by present-day borders do not establish historical sovereignty.','逐条引入有起止年、版本、争议说明和许可的政体记录，再与人口序列作时空连接。','Join dated polity records to demographic series only after verifying dates, competing interpretations and rights.','Seshat Global History Databank','https://seshat-db.com/'],
  ['history','历史土地利用','Historical land use','当前格网人口使用 2020 年 GHSL；生态带是地理分类。','The current H3 population layer uses GHSL 2020. Biomes are geographical classifications.','加入 HYDE 历史时期的耕地和牧场格网，按面积守恒聚合，保留原始时代与假设。','Aggregate HYDE cropland and grazing grids conservatively and retain the reconstruction assumptions for each epoch.','PBL / HYDE','https://www.pbl.nl/en/hyde'],
  ['history','长期城市增长','Long-run urban growth','GeoNames 居民点人口的参考日因地而异。','GeoNames settlement counts have different reference dates.','按城市边界版本接入 GHSL 多时相城市数据，并验证改界是否造成虚假的人口跳跃。','Add multi-temporal GHSL urban centres with boundary versions and test for artificial growth caused by redefinition.','European Commission / GHSL','https://human-settlement.emergency.copernicus.eu/'],
  ['markets','全球逐股日行情','Global daily security histories','当前提供有来源的上市证券样本和本地文件入口。不同市场的再分发条款各异。','Sourced exchange samples and local-file access are available. Redistribution terms vary by exchange.','逐交易所获取含退市证券的名录、交易日历、拆分分红和原币种。仅在获许可的范围公开逐日 OHLCV。','Acquire listings including delistings, calendars, corporate actions and native currencies exchange by exchange. Publish OHLCV within the rights granted.','World Federation of Exchanges','https://www.world-exchanges.org/our-work/statistics'],
  ['markets','A 股跨市场历史','Mainland China equity history','已验证的本地快照可按证券读取开高低收、成交和市值。','A verified local archive can be queried by security for OHLC, turnover and market capitalization.','通过本地导入使用既有历史库；公开版本需补充供应方再分发依据、复权因子与后续交易日。','Use the local archive reader. Public expansion requires redistribution rights, adjustment factors and subsequent trading sessions.','Shanghai Stock Exchange','https://www.sse.com.cn/market/price/trends/'],
  ['markets','美国证券基本面和日线','US fundamentals and daily prices','季度申报日与逐日交易收盘日是两种时间口径。','Quarterly filing dates and trading-session closes use different clocks.','先按 SEC 的公开接口接入带申报日期的 XBRL 事实。逐日价格向有历史退市股覆盖和再分发授权的市场供应方取得。','Ingest SEC filing-date XBRL facts first. Acquire daily prices with delisted coverage and publishing rights from a market-data provider.','SEC EDGAR APIs','https://www.sec.gov/search-filings/edgar-application-programming-interfaces'],
  ['markets','日本、印度、巴西与欧洲股票','Japanese, Indian, Brazilian and European equities','日历、币种、市场板块和历史代码都需要按交易所核对。','Calendars, currencies, market segments and historical identifiers require exchange-specific reconciliation.','日本接入 J-Quants，印度查 NSE 历史报告，巴西查 B3 COTAHIST，欧洲按交易场所取得牌照。接入前核实订阅层级及再分发权限。','Check J-Quants, NSE historical reports, B3 COTAHIST and European venues. Verify subscription tiers and redistribution rights before admission.','JPX J-Quants','https://jpx-jquants.com/'],
  ['space','航天器与载荷名录','Space objects and payloads','现有星历覆盖行星与五艘深空探测器；里程碑另有机构来源。','Ephemerides cover the planets and five deep-space probes; mission milestones have separate institutional sources.','接入 UNOOSA 登记和民用科研任务名录，记录任务编号、发射与结束时间，区分登记状态和仍可通信。','Ingest registry and civilian science-mission records with stable ids and lifecycle dates; distinguish registration from communications status.','UNOOSA Register','https://www.unoosa.org/oosa/en/spaceobjectregister/index.html'],
  ['space','地外着陆点与科学活动','Off-world landing sites and science activity','星历给出轨道位置；地表科研数据需独立的天体坐标系。','Ephemerides give trajectories. Surface science needs body-fixed reference frames.','加入公开月球、火星等着陆器和科学测线，记录天体、经度制与 PDS 数据产品编号。','Add documented lunar and Martian landers and science traverses with body, longitude convention and PDS product identifiers.','NASA Planetary Data System','https://pds.nasa.gov/'],
  ['space','无线电活动的传播边界','Radio-signal propagation limits','界面可计算假设发射时刻的真空光前沿；实际可探测范围取决于方向与灵敏度。','The interface computes an ideal vacuum light front. Detectability depends on direction and sensitivity.','获取有时间戳的发射与接收记录、天线方向和功率不确定性后，才建立特定科学发射事件的模型。','Model individual scientific transmissions after securing dated send/receive records, antenna orientation and power uncertainty.','NASA Deep Space Network','https://www.nasa.gov/directorates/somd/space-communications-navigation-program/deep-space-network/'],
  ['society','多时期社会调查','Repeated social surveys','地方议事的生活圈与态度参数为虚构。经济指标只提供物质起点。','Council circles and attitudes are hypothetical. Economic observations provide material starting conditions.','对齐 WVS / EVS / ESS 各轮题项、人口样本和权重，检验跨时可比性，只公开许可范围内的匿名聚合。','Harmonize survey waves, questions, samples and weights; test comparability over time and publish licensed anonymous aggregates.','World Values Survey','https://www.worldvaluessurvey.org/'],
  ['society','历史贸易与能源网络','Historical trade and energy networks','设施名录说明点位和名义装机。跨境货流需要贸易伙伴数据。','Facility inventories identify locations and nameplate capacity. Cross-border flows require partner data.','按伙伴、商品与年度接入 UN Comtrade 或 BACI 的允许发布数据，记录镜像贸易差和单位转换。','Ingest licensed partner-product-year Comtrade or BACI records with mirror-flow discrepancies and explicit unit conversions.','UN Comtrade','https://comtradeplus.un.org/'],
  ['history','中国官方人口长序列','Official Chinese population series','国家统计局年鉴表 2-1 为图片，OCR 不完整，未纳入；现有跨地区人口使用世界银行 WDI。','The NBS yearbook table 2-1 is an image and OCR was incomplete, so it is not included. Cross-country population uses World Bank WDI.','从机器可读的官方表格或接口取得 1949 年以来年末总人口，并标注与 GDP 相同的统计范围。','Acquire year-end population since 1949 from a machine-readable official table or interface with the same scope as official GDP.','国家统计局 中国统计年鉴','https://www.stats.gov.cn/sj/ndsj/2024/indexch.htm'],
];

export function renderWishlist(host,ctx) {
  const {t}=ctx;
  const groups=[['all','全部','All'],['history','历史','History'],['markets','市场','Markets'],['space','太空','Space'],['society','社会','Society']];
  host.className='coverage-lab';
  host.innerHTML=`<p>${esc(t('每个愿望项列出当前证据、取得渠道和下一项接入条件。历史时段、地理边界和授权会随数据集分别记录。','Each item records current evidence, an acquisition route and the next acceptance condition. Time intervals, geographic boundaries and rights are tracked per dataset.'))}</p><section class="coverage-summary" data-coverage-summary aria-live="polite"></section><label>${esc(t('专题','Collection'))} <select name="wish-category">${groups.map(([key,zh,en])=>`<option value="${key}">${esc(t(zh,en))}</option>`).join('')}</select></label><div class="coverage-grid"></div>
    <section class="data-downloads" data-downloads><h3>${esc(t('原始数据下载','Raw data downloads'))}</h3>
      <p>${esc(t('以 JSON 形式提供本站使用的静态数据；缺失与来源说明见上。','Static JSON used by this site; missing values and sources are documented above.'))}</p>
      <ul>
        <li><a href="data/annual/${Number(ctx.year)}.json" download>${esc(t('当前年度观测（{year}）','Annual observations ({year})').replace('{year}',String(Number(ctx.year))))}</a><small>data/annual/${Number(ctx.year)}.json</small></li>
        <li><a href="data/history/catalog.json" download>${esc(t('历史序列目录','History catalog'))}</a><small>data/history/catalog.json</small></li>
        <li><a href="data/history/series/WORLD.json" download>${esc(t('逐地区历史序列示例','Example regional history series'))}</a><small>data/history/series/&lt;ISO3&gt;.json</small></li>
        <li><a href="data/space/launches.json" download>${esc(t('太空发射序列','Space launch series'))}</a><small>data/space/launches.json</small></li>
        <li><a href="data/markets/index.json" download>${esc(t('市场数据目录','Market data index'))}</a><small>data/markets/index.json</small></li>
        <li><a href="data/atlas.json" download>${esc(t('指标与来源清单','Indicator and source catalog'))}</a><small>data/atlas.json · data/source-lock.json</small></li>
      </ul>
    </section>`;
  const draw=()=>{
    const selected=host.querySelector('select').value;
    host.querySelector('.coverage-grid').innerHTML=backlog.filter(([key])=>selected==='all'||key===selected).map(([key,zh,en,nowZh,nowEn,nextZh,nextEn,source,url])=>{
      const [,gz,ge]=groups.find(([id])=>id===key);
      return `<article><div data-kind>${esc(t(gz,ge))}</div><h3>${esc(t(zh,en))}</h3><p>${esc(t(nowZh,nowEn))}</p><p>${esc(t(nextZh,nextEn))}</p><a href="${url}" target="_blank" rel="noopener">${esc(source)} ↗</a></article>`;
    }).join('');
  };
  host.querySelector('select').onchange=draw; draw();
  void loadCoverage();

  async function loadCoverage() {
    const box=host.querySelector('[data-coverage-summary]');
    const labels=[['population','人口估计','Population'],['gdp','人均 GDP','GDP per capita'],['lifeExpectancy','预期寿命','Life expectancy'],['literacy','成人识字率','Adult literacy'],['cropland','耕地总面积','Cropland area'],['pasture','牧场面积','Pasture area'],['arable','可耕地占比','Arable share'],['census','人口普查实报','Census counts']];
    try {
      const [annual,history,provenance]=await Promise.all([load(`annual/${ctx.year}.json`),load('history/catalog.json'),load('history/sources.json')]);
      const regions=Object.values(annual.regions);
      const total=regions.length;
      const rows=ctx.metrics.map((metric)=>{
        const localized=localizeMetric(metric);
        const count=regions.reduce((sum,region)=>sum+(Number.isFinite(region[metric.id])?1:0),0);
        return {name:localized.name,unit:localized.unit||'',code:metric.code||'',updated:metric.updated||'',count,total,missing:total-count};
      });
      const historyRows=labels.filter(([key])=>history.totals[key]).map(([key,zh,en])=>{
        const world=history.areas.WORLD?.coverage?.[key];
        const source=provenance.sources?.[key];const url=source?.chart||source?.url||'';return {name:t(zh,en),rows:history.totals[key].rows,areas:history.totals[key].areas,first:world?.[0],last:world?.[1],url};
      });
      const percentage=(count,total)=>`${Math.round(count/total*100)}%`;
      const yearPicker=Number.isFinite(ctx.year)?ctx.year:'';
      box.innerHTML=`<h3>${esc(t('覆盖概览','Coverage overview'))}</h3>
        <p>${esc(t('按所选年份统计；空格与缺值不补齐。分母为当年观测文件中的已映射地区数，“有值地区”只计有已发布数值的地区。','Counted for the selected year. Gaps stay unfilled; “regions with data” counts published values only.'))}</p>
        <h4>${esc(t('年度指标 · {year}','Annual indicators · {year}').replace('{year}',String(yearPicker)))}</h4>
        <div class="table-scroll"><table><caption>${esc(t('当前年份各指标的有值地区数','Regions with published values by indicator'))}</caption><thead><tr><th scope="col">${esc(t('指标','Indicator'))}</th><th scope="col">${esc(t('单位','Unit'))}</th><th scope="col">${esc(t('有值地区','Regions with data'))}</th><th scope="col">${esc(t('覆盖率','Coverage'))}</th><th scope="col">${esc(t('来源','Source'))}</th></tr></thead><tbody>${rows.map(row=>`<tr><th scope="row">${esc(row.name)}</th><td>${esc(row.unit)}</td><td>${row.count} / ${row.total}</td><td>${percentage(row.count,row.total)}</td><td>${row.code?`<a href="https://data.worldbank.org/indicator/${encodeURIComponent(row.code)}" target="_blank" rel="noopener" title="${esc(row.updated)}">${esc(row.code)} ↗</a>`:'—'}</td></tr>`).join('')}</tbody></table></div>
        <h4>${esc(t('历史序列','Historical series'))}</h4>
        <div class="table-scroll"><table><caption>${esc(t('历史数据的总发布值与地区数，全球序列的时间范围','Published values, covered areas and world span for each historical series'))}</caption><thead><tr><th scope="col">${esc(t('指标','Indicator'))}</th><th scope="col">${esc(t('地区数','Areas'))}</th><th scope="col">${esc(t('发布值','Published values'))}</th><th scope="col">${esc(t('全球范围','World span'))}</th><th scope="col">${esc(t('来源','Source'))}</th></tr></thead><tbody>${historyRows.map(row=>{let host='';try{host=new URL(row.url).hostname.replace(/^www\./,'')}catch{}return `<tr><th scope="row">${esc(row.name)}</th><td>${row.areas}</td><td>${row.rows.toLocaleString(ctx.locale||undefined)}</td><td>${row.first==null?'—':`${row.first}–${row.last}`}</td><td>${host?`<a href="${esc(row.url)}" target="_blank" rel="noopener">${esc(host)} ↗</a>`:'—'}</td></tr>`}).join('')}</tbody></table></div>
        <p class="coverage-note">${esc(t('缺失原因与来源见“资料 → 数据来源与方法”，逐项取得的原始文件校验值见 source-lock.json。','Missing reasons and sources are in Data sources and methods; per-file checksums are in source-lock.json.'))}</p>`;
    } catch {
      box.innerHTML=`<p class="coverage-note">${esc(t('覆盖概览暂时无法载入。','Coverage overview is temporarily unavailable.'))}</p>`;
    }
  }
}
