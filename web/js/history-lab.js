export const HISTORY_TRANSLATIONS = Object.freeze({
  title: { zh: '深时历史工作台', en: 'Deep-time history lab' },
  intro: { zh: '从早期智人的测年证据，追溯人口、土地与经济的历史序列。', en: 'Explore dated evidence of early humans and historical series on population, land, and economies.' },
  loading: { zh: '正在读取历史档案…', en: 'Loading the historical archive…' },
  loadingSeries: { zh: '正在读取地区序列…', en: 'Loading the regional series…' },
  loadFailed: { zh: '未能读取历史档案。', en: 'The historical archive could not be loaded.' },
  seriesFailed: { zh: '未能读取该地区的序列。', en: 'The regional series could not be loaded.' },
  retry: { zh: '重试', en: 'Retry' },
  area: { zh: '地区', en: 'Region' },
  period: { zh: '时段', en: 'Period' },
  metric: { zh: '指标', en: 'Indicator' },
  atlasRegions: { zh: '现代地图地区', en: 'Present-day map regions' },
  aggregates: { zh: '地理汇总区', en: 'Geographic aggregates' },
  hydeRegions: { zh: 'HYDE 土地研究分区', en: 'HYDE land-use study regions' },
  HYDE_NAM: { zh: '北美（HYDE）', en: 'North America (HYDE)' },
  HYDE_LAM: { zh: '拉丁美洲（HYDE）', en: 'Latin America (HYDE)' },
  HYDE_EUR: { zh: '欧洲（HYDE）', en: 'Europe (HYDE)' },
  HYDE_USSR: { zh: '原苏联范围（HYDE）', en: 'Former USSR area (HYDE)' },
  HYDE_MENA: { zh: '北非和中东（HYDE）', en: 'North Africa and Middle East (HYDE)' },
  HYDE_TRAF: { zh: '热带非洲（HYDE）', en: 'Tropical Africa (HYDE)' },
  HYDE_CHN: { zh: '中国研究区（HYDE）', en: 'China study region (HYDE)' },
  HYDE_SAS: { zh: '南亚（HYDE）', en: 'South Asia (HYDE)' },
  HYDE_SEAS: { zh: '东南亚（HYDE）', en: 'Southeast Asia (HYDE)' },
  HYDE_PACDEV: { zh: '太平洋发达地区（HYDE）', en: 'Pacific developed region (HYDE)' },
  map: { zh: '在现代地图定位', en: 'Locate on the present-day map' },
  all: { zh: '全部时段', en: 'All periods' },
  deep: { zh: '旧石器时代证据', en: 'Palaeolithic evidence' },
  ancient: { zh: '史前晚期与古代', en: 'Later prehistory and antiquity' },
  medieval: { zh: '中世纪时段', en: 'Medieval period' },
  earlyModern: { zh: '近代早期', en: 'Early modern period' },
  industrial: { zh: '工业化时段', en: 'Industrial-era period' },
  modern: { zh: '现代', en: 'Modern period' },
  boundaries: { zh: '地名用于现代地图定位。历史政体、人口统计范围和遗址当时的地理归属可能不同。各时段按统一历年划分。', en: 'Names locate places on today’s map. Historical polities, enumeration areas, and the geography of sites can differ. Period filters use shared calendar cutoffs.' },
  bce: { zh: '公元前{n}年', en: '{n} BCE' },
  ce: { zh: '公元{n}年', en: '{n} CE' },
  epoch: { zh: '纪元交界', en: 'Era boundary' },
  epochNote: { zh: '“纪元交界”保留来源使用的 {zero} 年基准。', en: '“Era boundary” preserves the source’s year-{zero} benchmark.' },
  interval: { zh: '{first}至{last}', en: '{first} to {last}' },
  until: { zh: '{year}起', en: '{year} onward' },
  before: { zh: '{year}以前', en: 'Before {year}' },
  evidence: { zh: '测年证据', en: 'Dated evidence' },
  chronologicalGap: { zh: '量化覆盖断层', en: 'Gap in quantitative coverage' },
  gapSummary: { zh: '目前最早的量化序列始于{year}。更早的遗址提供零散的活动证据，其间的人口、土地和经济序列尚缺。', en: 'The earliest quantitative series start in {year}. Earlier sites document scattered traces of activity, with gaps in population, land, and economic series.' },
  series: { zh: '历年序列', en: 'Calendar-year series' },
  siteCount: { zh: '当前筛选匹配 {n} 处遗址', en: '{n} sites match these filters' },
  noEvidence: { zh: '当前地区和时段暂无已收录的测年证据。', en: 'The archive has no dated evidence for this region and period.' },
  evidenceNote: { zh: '年代采用论文报告的区间或下限。化石、器物与足迹的测年依据不同，遗址出现年代只约束当地活动证据。', en: 'Dates retain the published ranges or lower bounds. Fossils, artefacts, and footprints use different dating evidence and constrain activity at their respective sites.' },
  evidenceWorld: { zh: '查看全球早期遗址', en: 'Explore early sites worldwide' },
  ageRange: { zh: '距今 {old}–{young} 千年', en: '{old}–{young} thousand years ago' },
  ageMargin: { zh: '距今 {center} ± {error} 千年', en: '{center} ± {error} thousand years ago' },
  ageMinimum: { zh: '最低年龄为 {center} ± {error} 千年', en: 'Minimum age of {center} ± {error} thousand years' },
  ageCalibrated: { zh: '距 {epoch} 年 {old}–{young} 校准千年', en: '{old}–{young} calibrated kyr BP (before {epoch})' },
  citationShort: { zh: '{author}（{year}）', en: '{author} ({year})' },
  irhoud: { zh: '杰贝尔伊鲁德', en: 'Jebel Irhoud' },
  irhoudNote: { zh: '热释光测定与早期智人化石同层的火烧燧石。报告值为工具和化石所在层的加权年代。', en: 'Thermoluminescence on heated flints associated with early Homo sapiens fossils gives a weighted age for the layer.' },
  omo: { zh: '奥莫基比什 I 号化石', en: 'Omo Kibish I' },
  omoNote: { zh: '用氩同位素测定与化石上覆灰层相匹配的火山喷发。灰层的年龄与误差约束化石的最低年龄。', en: 'Argon isotope dating constrains an eruption correlated with ash above the fossil. The ash age and its uncertainty set a lower bound.' },
  misliya: { zh: '米斯利亚洞穴', en: 'Misliya Cave' },
  misliyaNote: { zh: '结合铀系及铀系–电子自旋共振测年，约束智人上颌与牙齿的年龄。', en: 'U-series and combined U-series–electron spin resonance dating constrain the age of a Homo sapiens jaw and teeth.' },
  herto: { zh: '赫托', en: 'Herto' },
  hertoNote: { zh: '智人头骨所在层的年龄由地层及氩同位素测年约束。', en: 'Stratigraphy and argon isotope dating bracket the layer containing Homo sapiens crania.' },
  tamPaLing: { zh: '坦帕林洞穴', en: 'Tam Pà Ling' },
  tamPaLingNote: { zh: '用沉积物释光和动物牙齿测年建立地层模型，约束早期智人额骨及胫骨碎片的年代。', en: 'Sediment luminescence and dated animal teeth constrain the modelled age of early Homo sapiens frontal bone and tibia fragments.' },
  madjedbebe: { zh: '马杰德贝贝岩棚', en: 'Madjedbebe rock shelter' },
  madjedbebeNote: { zh: '以光释光测定器物层中的沉积物，区间采用论文报告的起始年龄及其扩展不确定度。器物与沉积物是否同时沉积仍有争论。', en: 'Optically stimulated luminescence dates sediment in the artefact layer. The range uses the reported start age and its expanded uncertainty. The association of artefacts and sediment remains debated.' },
  bachoKiro: { zh: '巴乔基罗洞穴', en: 'Bacho Kiro Cave' },
  bachoKiroNote: { zh: '直接放射性碳测年的人骨支持该层的校准年代区间。区间为地层模型的报告值。', en: 'Direct radiocarbon dates on human bones support the calibrated interval reported by the model for the layer.' },
  liujiang: { zh: '柳江通天岩智人', en: 'Liujiang skeleton, Tongtianyan Cave' },
  liujiangNote: { zh: '化石的铀系测年与沉积物的放射性碳、光释光测年共同约束柳江智人骨架的修订年龄。', en: 'U-series dating of the fossil and radiocarbon and luminescence dates on sediments constrain the revised age of the Liujiang skeleton.' },
  whiteSands: { zh: '白沙国家公园足迹', en: 'White Sands footprints' },
  whiteSandsNote: { zh: '以花粉和水生植物种子的放射性碳测年约束含有人类足迹的沉积层。', en: 'Radiocarbon dating of pollen and aquatic seeds constrains the age of sediments bearing human footprints.' },
  huacaPrieta: { zh: '瓦卡普列塔遗址', en: 'Huaca Prieta' },
  huacaPrietaNote: { zh: '早期文化地层含有石器与食物遗存，区间为论文给出的校准年代。附有针对其他样品和图件的勘误。', en: 'Early cultural deposits contain stone tools and food remains. The range is the study’s calibrated estimate, with an erratum linked for other samples and figures.' },
  population: { zh: '人口估计', en: 'Population estimates' },
  gdp: { zh: '人均 GDP', en: 'GDP per capita' },
  lifeExpectancy: { zh: '预期寿命', en: 'Life expectancy' },
  literacy: { zh: '成人识字率', en: 'Adult literacy' },
  cropland: { zh: '耕地总面积', en: 'Cropland area' },
  pasture: { zh: '牧场面积', en: 'Pasture area' },
  density: { zh: '历史人口密度', en: 'Historical population density' },
  worldGdp: { zh: '全球 GDP 总量', en: 'World GDP' },
  urbanShare: { zh: '城镇人口占比', en: 'Urban population share' },
  officialPopulation: { zh: '中国官方年末人口', en: 'Official year-end population' },
  arable: { zh: '可耕地占陆地比例', en: 'Arable land share' },
  census: { zh: '人口普查实报', en: 'Census population counts' },
  people: { zh: '人', en: 'people' },
  years: { zh: '岁', en: 'years' },
  densityUnit: { zh: '人/km²', en: 'people/km²' },
  constantIntlDollar: { zh: '不变价国际元', en: 'constant international-$' },
  percent: { zh: '%', en: '%' },
  dollars: { zh: '{year} 年价格国际元', en: 'international dollars at {year} prices' },
  squareKm: { zh: '平方公里', en: 'km²' },
  share: { zh: '占陆地比例', en: 'of land area' },
  populationNote: { zh: 'OWID 汇编的历史重建和人口估计。不同来源之间可能存在断点。逐地区逐年来源可在方法页核对。', en: 'OWID combines historical reconstructions and population estimates. Source changes can introduce breaks. The methodology page lists sources by region and year.' },
  gdpNote: { zh: 'Maddison 统一价格基准后的来源估计，早期样本尤其稀疏。', en: 'Maddison estimates use harmonized price benchmarks. Early samples are particularly sparse.' },
  lifeExpectancyNote: { zh: '出生时预期寿命，由 Riley、Zijdeman 等、人类死亡率数据库与联合国世界人口展望汇编；英国样本可追溯至 1543 年，全球合计自 1770 年起。单年危机可能造成明显下凹。', en: 'Period life expectancy at birth, compiled from Riley, Zijdeman et al., the Human Mortality Database and UN World Population Prospects. Country samples reach back to 1543 and the world aggregate to 1770. Single-year crises can cause sharp dips.' },
  literacyNote: { zh: '成人识字率来自联合国教科文组织统计研究所的调查与估计，按不规则的调查年份发布，后一次调查可能修订先前值；100% 表示报告值，不代表已逐人测量。', en: 'Adult literacy comes from UNESCO Institute for Statistics surveys and estimates, reported at irregular survey years; later surveys may revise earlier values. A reported 100% is a published rate, not a person-by-person measurement.' },
  croplandNote: { zh: 'HYDE 全球耕地面积模型估计，包含永久作物。发布的零值保留。', en: 'HYDE models global cropland area including permanent crops. Published zero values are retained.' },
  pastureNote: { zh: 'HYDE 全球牧场面积模型估计，与耕地同源；早期年份为模型反推，零值保留。', en: 'HYDE models global pasture area from the same source as cropland. Early years are model reconstructions; published zeros are retained.' },
  densityNote: { zh: '由 HYDE、Gapminder、联合国人口展望与 FAO 的数据按当代边界汇总；2023 年后的投影年份不纳入历史序列。', en: 'Aggregated to present-day boundaries from HYDE, Gapminder, UN WPP and FAO. Projected years after 2023 are excluded from the historical series.' },
  worldGdpNote: { zh: '全球 GDP 总量按不变价国际元计算，来自 Maddison 数据库、Maddison 项目数据库、世界银行及 OECD/Eurostat/IMF；早期只有稀疏基准年，空隙不插值。', en: 'World GDP in constant international-$, from the Maddison Database, Maddison Project Database, World Bank and Eurostat/OECD/IMF. Early years are sparse benchmarks; gaps are not interpolated.' },
  urbanShareNote: { zh: '城镇人口占全部人口的比例，来自联合国经济和社会事务部人口司（2025），按当代边界汇总；2023 年后的估计年份不纳入历史序列。', en: 'Share of the population living in urban areas from UN DESA Population Division (2025), aggregated to present-day boundaries; estimates after 2023 are excluded.' },
  officialPopulationNote: { zh: '国家统计局官方年末人口：1949、1950、1951、1955、1960、1965 及 1970–2023 来自《中国统计年鉴 2024》表 2-1（选年），2024–2025 来自年度统计公报；表 2-1 不列 1952–1954 等年份，不插值。', en: 'Official year-end population from the NBS yearbook table 2-1 for selected years (1949, 1950, 1951, 1955, 1960, 1965 and 1970–2023) and from annual communiqués for 2024–2025. Years absent from table 2-1 are not interpolated.' },
  croplandRegionalNote: { zh: 'HYDE 3.2 论文表 2 的区域耕地基准点，已换算为平方公里。分区与现代地图边界可能不同。', en: 'Regional cropland benchmarks from HYDE 3.2 Table 2, converted to square kilometres. Study regions may differ from present-day map boundaries.' },
  arableNote: { zh: 'FAO 经世界银行发布的可耕地占比。下载表未提供逐条观测标志，记为汇编统计。此指标采用可耕地口径和比例单位。', en: 'FAO arable land share via the World Bank. The download lacks point-level observation flags, so entries are labelled as compiled statistics. The definition is arable land and the unit is a share.' },
  censusNote: { zh: '美国人口普查局发布的居民普查人数，覆盖美国及波多黎各。历史统计覆盖范围可能变化。', en: 'Published resident counts from the U.S. Census Bureau for the United States and Puerto Rico. Historical enumeration coverage can vary.' },
  estimated: { zh: '估计', en: 'Estimate' },
  observed: { zh: '观测 · 普查计数', en: 'Observed census count' },
  compiled: { zh: '汇编统计', en: 'Compiled statistic' },
  missing: { zh: '缺失', en: 'Missing' },
  empty: { zh: '该地区在所选时段没有这一指标的记录。', en: 'This indicator has no records for the selected region and period.' },
  available: { zh: '该地区现有记录覆盖{span}。', en: 'Records for this region cover {span}.' },
  samples: { zh: '{n} 个发布值 · {kind} · {span}', en: '{n} published values · {kind} · {span}' },
  noInterpolation: { zh: '横轴按实际历年缩放。相邻年份且处于同一来源阶段的点连接；空档用表中缺失区间标明。', en: 'The horizontal scale uses elapsed calendar years. Lines join consecutive years within a source period. The table marks gaps as missing spans.' },
  year: { zh: '年份或区间', en: 'Year or interval' },
  value: { zh: '发布值', en: 'Published value' },
  status: { zh: '数据性质', en: 'Data type' },
  source: { zh: '来源', en: 'Source' },
  selectYear: { zh: '定位年份', en: 'Inspect a year' },
  selectedPoint: { zh: '{year} · {value} · {kind} · {source}', en: '{year} · {value} · {kind} · {source}' },
  hydePopulation: { zh: 'OWID · HYDE 时段', en: 'OWID · HYDE period' },
  gapminder: { zh: 'OWID · Gapminder 时段', en: 'OWID · Gapminder period' },
  un: { zh: 'OWID · 联合国 WPP 时段', en: 'OWID · UN WPP period' },
  hyde: { zh: 'HYDE 3.3 · DataHub', en: 'HYDE 3.3 · DataHub' },
  hydeTable: { zh: 'HYDE 3.2 · 论文表 2', en: 'HYDE 3.2 · Table 2' },
  maddison: { zh: 'Maddison 2023 · OWID', en: 'Maddison 2023 · OWID' },
  owidLife: { zh: 'OWID · 预期寿命长序列', en: 'OWID · long-run life expectancy' },
  owidLiteracy: { zh: 'UNESCO UIS · OWID', en: 'UNESCO UIS · OWID' },
  owidDensity: { zh: 'OWID · 人口密度', en: 'OWID · population density' },
  owidWorldGdp: { zh: 'Maddison / World Bank · OWID', en: 'Maddison / World Bank · OWID' },
  owidUrban: { zh: 'UN DESA · OWID', en: 'UN DESA · OWID' },
  chinaOfficialPopulation: { zh: '国家统计局 · 年鉴表 2-1 / 年度公报', en: 'NBS · yearbook table 2-1 / annual communiqués' },
  tenThousandPeople: { zh: '万人', en: '10,000 people' },
  official: { zh: '官方发布', en: 'Official release' },
  wdi: { zh: 'FAO · 世界银行 WDI', en: 'FAO · World Bank WDI' },
  censusBureau: { zh: '美国人口普查局', en: 'U.S. Census Bureau' },
  backtest: { zh: '时间回归与留后回测', en: 'Time regression and holdout test' },
  exportSeries: { zh: '导出当前序列 CSV', en: 'Export current series CSV' },
  modelBetterNote: { zh: '留后区间内，对数线性拟合的 MAPE 为 {model}，低于末值持平基线的 {baseline}。', en: 'In the holdout window the log-linear fit has MAPE {model}, better than the last-value baseline at {baseline}.' },
  baselineBetterNote: { zh: '留后区间内，末值持平基线的 MAPE 为 {baseline}，低于对数线性拟合的 {model}；这一序列更适合把基线作为默认外推。', en: 'In the holdout window the last-value baseline has MAPE {baseline}, better than the log-linear fit at {model}; for this series the baseline is the safer default.' },
  similarNote: { zh: '两种方法的留后 MAPE 接近（拟合 {model}，基线 {baseline}），差异不足以支持模型偏好。', en: 'The two methods have similar holdout MAPE ({model} for the fit, {baseline} for the baseline); the difference does not justify a model preference.' },
  cutoff: { zh: '训练截止年', en: 'Training cutoff year' },
  training: { zh: '训练样本', en: 'Training sample' },
  holdout: { zh: '留后样本', en: 'Holdout sample' },
  window: { zh: '{n} 个点 · {span}', en: '{n} points · {span}' },
  leads: { zh: '距训练末点 {first}–{last} 年', en: '{first}–{last} years after the final training point' },
  model: { zh: '对数线性拟合', en: 'Log-linear fit' },
  baseline: { zh: '末值持平基线', en: 'Last-value baseline' },
  parameters: { zh: '以 {year} 为时间原点，截距 {intercept}，年斜率 {slope}。', en: 'Time origin {year}. Log intercept {intercept}, annual log slope {slope}.' },
  growth: { zh: '拟合年变化率', en: 'Fitted annual change' },
  mae: { zh: '平均绝对误差', en: 'Mean absolute error' },
  percentagePoints: { zh: '个百分点', en: 'percentage points' },
  mape: { zh: '平均绝对百分比误差', en: 'Mean absolute percentage error' },
  prediction: { zh: '留后拟合预测', en: 'Holdout prediction' },
  heldoutValues: { zh: '逐年核对留后预测', en: 'Inspect holdout predictions by year' },
  errorValues: { zh: '核对留后值 · 拟合 {fit} · 持平 {flat}', en: 'Holdout prediction · fit {fit} · baseline {flat}' },
  fitNote: { zh: '以实际历年间隔拟合 ln(值)，每个发布年点权重相同。截止年之后的点仅用于评估，与最后一个训练值比较。回测评估对发布序列的拟合。', en: 'Ordinary least squares fits ln(value) over elapsed calendar years, with equal weight per published point. Later points score the fit against the last training value. Scores measure agreement with the published series.' },
  excluded: { zh: '{n} 个非正值保留在序列中，因对数定义域未参与回测。', en: '{n} nonpositive values remain in the series and are outside the logarithm’s domain.' },
  insufficient: { zh: '可用正值 {n} 个。回测需要至少 {train} 个训练点和 {test} 个留后点。', en: 'There are {n} positive values. A backtest needs at least {train} training and {test} holdout points.' },
  numericFailure: { zh: '该时间范围的拟合无法产生可计算的预测。请选择其他截止年或时段。', en: 'The fit cannot produce finite predictions over this span. Choose a different cutoff or period.' },
  wish: { zh: '仍待补齐的数据', en: 'Data still to add' },
  wishEvidence: { zh: '更多可开放的遗址测年原始记录、校准模型和地层数据，尤其是各洲的空白区域。', en: 'More openly reusable site dates, calibration models, and stratigraphic data, especially in regions with sparse coverage.' },
  wishSeries: { zh: '更早、更多地区的耕地和经济重建及其不确定度。各指标的覆盖始年以记录为准。', en: 'Earlier and wider regional land and economic reconstructions with uncertainty. Coverage starts at the first available record for each indicator.' },
  wishCensus: { zh: '更多地区的可比较普查原表、历史行政边界和可核对的跨期地理对应关系。', en: 'Comparable census tables for more regions, historical boundaries, and documented crosswalks across periods.' },
  provenance: { zh: '来源、许可与校验和', en: 'Sources, licenses, and checksums' },
  sourceMethod: { zh: '原始来源与方法', en: 'Original source and methods' },
  sourceChart: { zh: '发布平台', en: 'Publication platform' },
  sourcePaper: { zh: '数据方法论文', en: 'Data methods paper' },
  sourceCitation: { zh: '数据引文 · {citation}', en: 'Data citation · {citation}' },
  publicDomain: { zh: '美国人口普查局 · 公共领域', en: 'U.S. Census Bureau · Public domain' },
  originalPapers: { zh: 'Maddison 原始研究引文（工作簿 Sources 表）', en: 'Original Maddison citations (workbook Sources sheet)' },
  historicalPapers: { zh: '本序列采用的历史研究', en: 'Historical studies for this series' },
  gdpModernSources: { zh: 'Maddison 自 {year} 年采用世界大型企业联合会的 Total Economy Database，并对其余地区使用联合国国民账户统计。', en: 'From {year}, Maddison uses the Conference Board Total Economy Database and UN national accounts for other areas.' },
  gdpExtractSources: { zh: '引文摘自 Spencer Graves 的 MaddisonData 对原工作簿 Sources 表的整理。', en: 'Bibliographic entries are from Spencer Graves’s MaddisonData extraction of the original workbook’s Sources sheet.' },
  checksumManifest: { zh: '下载校验清单', en: 'Download checksum manifest' },
});

const DATA_URL = new URL('../data/history/', import.meta.url);
const STYLE_URL = new URL('../history.css', import.meta.url);
const FILES = new Map();
const PERIODS = {
  all: [-Infinity, Infinity],
  deep: [-Infinity, -10001],
  ancient: [-10000, 499],
  medieval: [500, 1499],
  earlyModern: [1500, 1799],
  industrial: [1800, 1949],
  modern: [1950, Infinity],
};
const METRICS = {
  population: { unit: 'people', status: 'estimated' },
  gdp: { unit: 'dollars', status: 'estimated', source: 'maddison' },
  lifeExpectancy: { unit: 'years', status: 'estimated', source: 'owidLife' },
  literacy: { unit: 'percent', status: 'estimated', source: 'owidLiteracy' },
  cropland: { unit: 'squareKm', status: 'estimated', source: 'hyde' },
  pasture: { unit: 'squareKm', status: 'estimated', source: 'hyde' },
  density: { unit: 'densityUnit', status: 'estimated', source: 'owidDensity' },
  worldGdp: { unit: 'constantIntlDollar', status: 'estimated', source: 'owidWorldGdp' },
  urbanShare: { unit: 'percent', status: 'estimated', source: 'owidUrban' },
  officialPopulation: { unit: 'tenThousandPeople', status: 'official', source: 'chinaOfficialPopulation' },
  arable: { unit: 'share', status: 'compiled', source: 'wdi' },
  census: { unit: 'people', status: 'observed', source: 'censusBureau' },
};
const ERA_START = -10000;

function loadHistoryFile(path) {
  if (!FILES.has(path)) {
    FILES.set(path, fetch(new URL(path, DATA_URL)).then(response => {
      if (!response.ok) throw new Error(`${path}: ${response.status}`);
      return response.json();
    }).catch(error => {
      FILES.delete(path);
      throw error;
    }));
  }
  return FILES.get(path);
}

function calendarYear(sourceYear) {
  return sourceYear < 0 ? sourceYear + 1 : sourceYear;
}

function sourceYear(calendar) {
  return calendar < 0 ? calendar - 1 : calendar;
}

function scores(rows, column) {
  const total = rows.reduce((sum, row) => {
    const error = Math.abs(row[column] - row.actual);
    return { absolute: sum.absolute + error, relative: sum.relative + error / row.actual };
  }, { absolute: 0, relative: 0 });
  return { mae: total.absolute / rows.length, mape: total.relative / rows.length };
}

export function backtestHistory(points, cutoff) {
  const positive = points.filter(([year, value]) => Number.isInteger(year) && Number.isFinite(value) && value > 0)
    .sort(([left], [right]) => left - right);
  const train = positive.filter(([year]) => year <= cutoff);
  const test = positive.filter(([year]) => year > cutoff);
  const counts = { positive: positive.length, excluded: points.length - positive.length };
  if (train.length < 3 || test.length < 2) return { status: 'insufficient', ...counts };

  const origin = train[0][0];
  const elapsed = year => calendarYear(year) - calendarYear(origin);
  const logPoints = train.map(([year, value]) => [elapsed(year), Math.log(value)]);
  const averageX = logPoints.reduce((sum, [time]) => sum + time, 0) / train.length;
  const averageY = logPoints.reduce((sum, [, value]) => sum + value, 0) / train.length;
  const variance = logPoints.reduce((sum, [time]) => sum + (time - averageX) ** 2, 0);
  const covariance = logPoints.reduce((sum, [time, value]) => sum + (time - averageX) * (value - averageY), 0);
  const slope = covariance / variance;
  const intercept = averageY - slope * averageX;
  const [lastYear, baseline] = train.at(-1);
  const predictions = test.map(([year, actual]) => ({
    year, actual, model: Math.exp(intercept + slope * elapsed(year)), baseline,
    lead: elapsed(year) - elapsed(lastYear),
  }));
  const annualChange = Math.expm1(slope);
  const modelError = scores(predictions, 'model');
  const baselineError = scores(predictions, 'baseline');
  if (![intercept, annualChange, ...Object.values(modelError), ...Object.values(baselineError)].every(Number.isFinite)) {
    return { status: 'numericFailure', ...counts };
  }
  return {
    status: 'ok', ...counts, origin, slope, intercept, annualChange, predictions,
    modelError, baselineError,
    training: { count: train.length, first: origin, last: lastYear },
    holdout: { count: test.length, first: test[0][0], last: test.at(-1)[0] },
  };
}

export function backtestVerdict(fit) {
  if (!fit || fit.status !== 'ok') return 'insufficient';
  const model = fit.modelError.mape;
  const baseline = fit.baselineError.mape;
  if (model * 1.02 < baseline) return 'modelBetter';
  if (baseline * 1.02 < model) return 'baselineBetter';
  return 'similar';
}

function pointSource(metric, area, year) {
  if (metric === 'cropland' && area !== 'WORLD') return 'hydeTable';
  if (metric !== 'population') return METRICS[metric].source;
  if (year < 1800) return 'hydePopulation';
  if (year < 1950 || area === 'VAT') return 'gapminder';
  return 'un';
}

function getLocale(input) {
  try {
    return Intl.getCanonicalLocales(input)[0] || 'zh-CN';
  } catch {
    return 'zh-CN';
  }
}

function localize(ctx) {
  const locale = getLocale(ctx.locale);
  const zh = new Intl.Locale(locale).language === 'zh';
  const tr = (key, values = {}) => {
    const entry = HISTORY_TRANSLATIONS[key];
    const template = ctx.t?.(entry.zh, entry.en) ?? (zh ? entry.zh : entry.en);
    return template.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);
  };
  const numbers = new Intl.NumberFormat(locale, { maximumFractionDigits: 4 });
  const dates = new Intl.NumberFormat(locale, { useGrouping: false });
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 });
  const scientific = new Intl.NumberFormat(locale, { maximumSignificantDigits: 6 });
  const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
  const regions = new Intl.DisplayNames(locale, { type: 'region', fallback: 'none' });
  const collator = new Intl.Collator(locale);
  const number = value => numbers.format(value);
  const year = value => value === 0 ? tr('epoch') : tr(value < 0 ? 'bce' : 'ce', { n: dates.format(Math.abs(value)) });
  const span = (first, last) => first === last ? year(first) : tr('interval', { first: year(first), last: year(last) });
  const area = record => {
    if (record.label) return tr(record.label);
    const name = record.iso2 && /^(?:[A-Z]{2}|\d{3})$/.test(record.iso2) ? regions.of(record.iso2) : null;
    return name || ctx.t?.(record.zh, record.en) || (zh ? record.zh : record.en);
  };
  return { tr, area, collator, number, year, span, percent, scientific, compact, dates, locale };
}

function attachStyles(doc) {
  if ([...doc.querySelectorAll('link[rel="stylesheet"]')].some(link => link.href === STYLE_URL.href)) return;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = STYLE_URL.href;
  doc.head.append(link);
}

function elements(doc) {
  const node = (tag, className, text) => {
    const element = doc.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const button = (text, action, className = 'hl-button') => {
    const control = node('button', className, text);
    control.type = 'button';
    control.addEventListener('click', action);
    return control;
  };
  const link = (text, href) => {
    const anchor = node('a', '', text);
    anchor.href = href;
    if (anchor.origin !== doc.location?.origin) {
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
    }
    return anchor;
  };
  const select = (label, name) => {
    const wrapper = node('label', 'hl-field');
    const input = node('select');
    input.name = name;
    wrapper.append(node('span', '', label), input);
    return { wrapper, input };
  };
  const option = (value, text) => {
    const item = node('option', '', text);
    item.value = value;
    return item;
  };
  const table = (caption, headings) => {
    const wrapper = node('div', 'hl-table-wrap');
    const grid = node('table');
    const head = grid.createTHead().insertRow();
    for (const label of headings) {
      const cell = node('th', '', label);
      cell.scope = 'col';
      head.append(cell);
    }
    grid.createCaption().textContent = caption;
    wrapper.append(grid);
    return { wrapper, body: grid.createTBody() };
  };
  return { node, button, link, select, option, table };
}

function exportSeriesCsv(id, metric, points) {
  const lines = ['year,value,unit,status,source'];
  for (const [year, value] of points) {
    lines.push([year, value, METRICS[metric].unit, METRICS[metric].status, pointSource(metric, id, year)].join(','));
  }
  const blob = new Blob(['\ufeff' + lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `orbis-${id}-${metric}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function publishedValue(locale, metric, value, withUnit = false) {
  if (metric === 'arable' || METRICS[metric].unit === 'percent') return locale.percent.format(value / 100);
  if (metric === 'worldGdp') {
    const shown = locale.compact.format(value);
    return withUnit ? `${shown} ${locale.tr(METRICS[metric].unit)}` : shown;
  }
  return withUnit
    ? `${locale.number(value)} ${locale.tr(METRICS[metric].unit, { year: locale.dates.format(2011) })}`
    : locale.number(value);
}

function pointGaps(points, first, last) {
  const rows = [];
  let next = calendarYear(first);
  for (const [year, value] of points) {
    const current = calendarYear(year);
    if (next < current) rows.push({ missing: [sourceYear(next), sourceYear(current - 1)] });
    rows.push({ year, value });
    next = current + 1;
  }
  if (next <= calendarYear(last)) rows.push({ missing: [sourceYear(next), last] });
  return rows;
}

function drawChart(frame, points, fit, metric, area, locale, onPick) {
  const { tr, year, compact } = locale;
  const doc = frame.ownerDocument;
  const svg = (tag, attributes, text) => {
    const element = doc.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const width = 720;
  const height = 260;
  const plot = { left: 72, right: 660, top: 15, bottom: 220 };
  const chart = svg('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': tr('series') });
  const first = calendarYear(points[0][0]);
  const last = calendarYear(points.at(-1)[0]);
  const marks = fit.status === 'ok' ? fit.predictions : [];
  const values = points.map(([, value]) => value).concat(marks.flatMap(row => [row.model, row.baseline]));
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const pad = (maximum - minimum || maximum || 1) * 0.06;
  const yMin = Math.max(0, minimum - pad);
  const yMax = maximum + pad;
  const projectX = value => first === last
    ? (plot.left + plot.right) / 2
    : plot.left + (value - first) / (last - first) * (plot.right - plot.left);
  const projectY = value => plot.bottom - (value - yMin) / (yMax - yMin) * (plot.bottom - plot.top);
  for (const step of [0, 1, 2, 3, 4]) {
    const value = yMin + (yMax - yMin) * step / 4;
    const y = projectY(value);
    chart.append(
      svg('line', { x1: plot.left, x2: plot.right, y1: y, y2: y, class: 'hl-gridline' }),
      svg('text', { x: plot.left - 9, y: y + 4, 'text-anchor': 'end' },
        metric === 'arable' ? locale.percent.format(value / 100) : compact.format(value)),
    );
  }
  const ticks = [...new Set([0, 1, 2, 3].map(index => Math.round(first + (last - first) * index / 3)))];
  for (const tick of ticks) {
    chart.append(svg('text', { x: projectX(tick), y: plot.bottom + 25, 'text-anchor': 'middle' }, year(sourceYear(tick))));
  }

  const path = points.map(([date, value], index) => {
    const previous = points[index - 1]?.[0];
    const join = calendarYear(date) - calendarYear(previous) === 1
      && pointSource(metric, area, date) === pointSource(metric, area, previous);
    return `${join ? 'L' : 'M'}${projectX(calendarYear(date))},${projectY(value)}`;
  }).join(' ');
  chart.append(svg('path', { d: path, class: `hl-line hl-${METRICS[metric].status}` }));
  for (const { year: date, model, baseline } of marks) {
    const x = projectX(calendarYear(date));
    chart.append(
      svg('path', { d: `M${x - 3},${projectY(baseline) - 3}l6,6m-6,0l6,-6`, class: 'hl-baseline-mark' }),
      svg('circle', { cx: x, cy: projectY(model), r: 2.9, class: 'hl-fit-mark' }),
    );
  }
  for (const [date, value] of points) {
    const x = projectX(calendarYear(date));
    const y = projectY(value);
    const attrs = { class: `hl-point hl-${METRICS[metric].status}`, 'data-year': date };
    const mark = METRICS[metric].status === 'observed'
      ? svg('rect', { ...attrs, x: x - 3, y: y - 3, width: 6, height: 6 })
      : svg('circle', { ...attrs, cx: x, cy: y, r: 2.8 });
    mark.append(svg('title', {}, `${year(date)} · ${publishedValue(locale, metric, value)}`));
    chart.append(mark);
  }
  chart.addEventListener('click', event => {
    const mark = event.target.closest('[data-year]');
    if (mark) onPick(Number(mark.dataset.year));
  });
  frame.replaceChildren(chart);
  return new Map([...chart.querySelectorAll('[data-year]')].map(mark => [Number(mark.dataset.year), mark]));
}

function evidenceAge(site, locale) {
  const { tr, number, dates } = locale;
  const [young, old] = site.age;
  if (site.kind === 'margin' || site.kind === 'minimum') {
    return tr(site.kind === 'minimum' ? 'ageMinimum' : 'ageMargin', {
      center: number(site.center), error: number(old - site.center),
    });
  }
  return tr(site.kind === 'calibrated' ? 'ageCalibrated' : 'ageRange', {
    old: number(old), young: number(young), epoch: dates.format(1950),
  });
}

function evidenceIn(site, area, period, areas) {
  const siteArea = areas[site.region];
  if (area !== 'WORLD' && area !== site.region && area !== siteArea.group) return false;
  const bounds = site.kind === 'minimum' ? [-Infinity, 1950 - site.age[0] * 1000] : site.age
    .slice().reverse().map(age => 1950 - age * 1000);
  return bounds[0] <= period[1] && bounds[1] >= period[0];
}

function buildSources(ui, locale, record, bibliography, id) {
  const { node, link } = ui;
  const { tr } = locale;
  const details = node('details', 'hl-sources');
  details.append(node('summary', '', tr('provenance')), node('p', '', tr('sourceCitation', { citation: record.citation })));
  const links = node('ul', 'hl-links');
  const references = [
    ['sourceMethod', record.url], ['sourceChart', record.chart], ['sourcePaper', record.paper],
    ['originalPapers', record.workbook], ['checksumManifest', new URL('provenance.json', DATA_URL)],
  ];
  for (const [key, href] of references) {
    if (!href) continue;
    const item = node('li');
    item.append(link(tr(key), href));
    links.append(item);
  }
  for (const [label, href] of record.licenses) {
    const item = node('li');
    item.append(link(label.endsWith('Public domain') ? tr('publicDomain') : label, href));
    links.append(item);
  }
  details.append(links);
  if (bibliography) {
    const entries = id === 'WORLD' ? Object.values(bibliography.byRegion).flat() : bibliography.byRegion[id] ?? [];
    const citations = [...new Set(entries.map(([, citation]) => citation))];
    details.append(
      node('p', '', tr('gdpModernSources', { year: locale.dates.format(2008) })),
      node('p', '', tr('gdpExtractSources')),
    );
    if (citations.length) {
      const list = node('ul', 'hl-bibliography');
      list.setAttribute('aria-label', tr('historicalPapers'));
      for (const citation of citations) list.append(node('li', '', citation));
      details.append(list);
    }
  }
  return details;
}

function backtestPanel(ui, locale, fit, metric) {
  const { node, table } = ui;
  const { tr, number, year, span, percent, scientific } = locale;
  const result = node('div', 'hl-backtest-result');
  result.append(node('p', 'hl-note', tr('fitNote')));
  if (fit.excluded) result.append(node('p', 'hl-note', tr('excluded', { n: number(fit.excluded) })));
  if (fit.status !== 'ok') {
    result.append(node('p', 'hl-empty', tr(fit.status, { n: number(fit.positive), train: number(3), test: number(2) })));
    return result;
  }

  const summary = node('dl', 'hl-test-stats');
  const window = sample => tr('window', { n: number(sample.count), span: span(sample.first, sample.last) });
  const metrics = [
    ['training', window(fit.training)],
    ['holdout', `${window(fit.holdout)} · ${tr('leads', {
      first: number(fit.predictions[0].lead), last: number(fit.predictions.at(-1).lead),
    })}`],
    ['growth', percent.format(fit.annualChange)],
  ];
  for (const [key, value] of metrics) {
    const entry = node('div');
    entry.append(node('dt', '', tr(key)), node('dd', '', value));
    summary.append(entry);
  }
  result.append(summary, node('p', 'hl-note', tr('parameters', {
    year: year(fit.origin), intercept: scientific.format(fit.intercept), slope: scientific.format(fit.slope),
  })));
  const comparison = table(tr('backtest'), [tr('model'), tr('mae'), tr('mape')]);
  for (const [key, errors] of [['model', fit.modelError], ['baseline', fit.baselineError]]) {
    const row = comparison.body.insertRow();
    row.insertCell().textContent = tr(key);
    row.insertCell().textContent = metric === 'arable' ? `${number(errors.mae)} ${tr('percentagePoints')}` : number(errors.mae);
    row.insertCell().textContent = percent.format(errors.mape);
  }
  result.append(comparison.wrapper);
  const verdict = backtestVerdict(fit);
  result.append(node('p', `hl-verdict hl-verdict-${verdict}`, tr(`${verdict}Note`, {
    model: percent.format(fit.modelError.mape), baseline: percent.format(fit.baselineError.mape),
  })));
  const audit = node('details');
  const heldout = table(tr('heldoutValues'), [tr('year'), tr('value'), tr('prediction'), tr('baseline')]);
  for (const prediction of fit.predictions) {
    const row = heldout.body.insertRow();
    row.dataset.year = prediction.year;
    row.insertCell().textContent = year(prediction.year);
    for (const key of ['actual', 'model', 'baseline']) {
      row.insertCell().textContent = publishedValue(locale, metric, prediction[key]);
    }
  }
  audit.append(node('summary', '', tr('heldoutValues')), heldout.wrapper);
  result.append(audit);
  return result;
}

function mountWorkbench(root, ctx, ui, locale, catalog, evidence, provenance) {
  const { node, button, link, select, option, table } = ui;
  const { tr, area, collator, number, span, year } = locale;
  const { areas } = catalog;
  const activeCountry = typeof ctx.country === 'object' ? ctx.country?.id : ctx.country;
  const requested = String(activeCountry ?? '').toUpperCase();
  const initial = Object.hasOwn(areas, requested) ? requested
    : Object.entries(areas).find(([, record]) => record.mapId && record.iso2 === requested)?.[0] ?? 'WORLD';
  const filters = node('div', 'hl-controls');
  const regionField = select(tr('area'), 'history-region');
  const metricField = select(tr('metric'), 'history-metric');
  const periodField = select(tr('period'), 'history-period');
  const options = [
    ['aggregates', record => !record.mapId && record.group !== 'HYDE'],
    ['atlasRegions', record => Boolean(record.mapId)],
    ['hydeRegions', record => record.group === 'HYDE'],
  ];
  for (const [label, includes] of options) {
    const group = node('optgroup');
    group.label = tr(label);
    const choices = Object.entries(areas).filter(([, record]) => includes(record));
    choices.sort(([left, first], [right, second]) =>
      (left === 'WORLD' ? -1 : right === 'WORLD' ? 1 : collator.compare(area(first), area(second))));
    for (const [key, record] of choices) group.append(option(key, area(record)));
    regionField.input.append(group);
  }
  for (const key of Object.keys(METRICS)) metricField.input.append(option(key, tr(key)));
  for (const [key, [start, end]] of Object.entries(PERIODS)) {
    const description = key === 'all' ? '' : key === 'deep' ? tr('before', { year: year(ERA_START) })
      : end === Infinity ? tr('until', { year: year(start) }) : span(start, end);
    periodField.input.append(option(key, description ? `${tr(key)} · ${description}` : tr(key)));
  }
  regionField.input.value = initial;
  periodField.input.value = 'all';
  const mapButton = button(tr('map'), () => ctx.onSelect?.(areas[regionField.input.value].mapId));
  filters.append(regionField.wrapper, periodField.wrapper, metricField.wrapper, mapButton);

  const coverage = node('div', 'hl-coverage');
  const siteSection = node('section', 'hl-section');
  const siteList = node('div', 'hl-sites');
  const chartSection = node('section', 'hl-section');
  const seriesTitle = node('h3', '', tr('series'));
  const seriesBody = node('div', 'hl-series-body');
  const status = node('p', 'hl-status');
  status.setAttribute('role', 'status');
  chartSection.append(seriesTitle, status, seriesBody);
  const showEvidence = button(tr('evidenceWorld'), () => {
    regionField.input.value = 'WORLD';
    periodField.input.value = 'deep';
    void update();
  });
  const siteHeader = node('header', 'hl-section-header');
  siteHeader.append(node('h3', '', tr('evidence')), showEvidence);
  siteSection.append(siteHeader, node('p', 'hl-note', tr('evidenceNote')), siteList);
  const wish = node('details', 'hl-wish');
  const wishes = node('ul');
  for (const key of ['wishEvidence', 'wishSeries', 'wishCensus']) wishes.append(node('li', '', tr(key)));
  wish.append(node('summary', '', tr('wish')), wishes);
  root.append(filters, node('p', 'hl-note', tr('boundaries')), coverage, siteSection, chartSection, wish);

  let request = 0;

  function showSites(sites) {
    if (!sites.length) {
      siteList.replaceChildren(node('p', 'hl-empty', tr('noEvidence')));
      return;
    }
    siteList.replaceChildren(...sites.map(site => {
      const card = node('article', 'hl-site');
      const siteDate = node('strong', 'hl-age', evidenceAge(site, locale));
      const place = node('span', 'hl-place', area(areas[site.region]));
      card.append(siteDate, node('h4', '', tr(site.id)), place, node('p', '', tr(`${site.id}Note`)));
      const cites = node('div', 'hl-links');
      for (const [author, published, doi] of site.papers) {
        cites.append(link(tr('citationShort', { author, year: locale.dates.format(published) }), `https://doi.org/${doi}`));
      }
      if (ctx.onSelect) cites.append(button(tr('map'), () => ctx.onSelect(areas[site.region].mapId), 'hl-text-button'));
      card.append(cites);
      return card;
    }));
  }

  function showCoverage(sites, range) {
    const tile = (key, description) => {
      const block = node('div', `hl-coverage-${key}`);
      block.append(node('strong', '', tr(key)), node('span', '', description));
      return block;
    };
    const siteText = sites.length
      ? `${evidenceAge(sites[0], locale)} · ${tr('siteCount', { n: number(sites.length) })}` : tr('siteCount', { n: number(0) });
    coverage.replaceChildren(
      tile('evidence', siteText),
      tile('chronologicalGap', tr('gapSummary', { year: year(ERA_START) })),
      tile('series', range ? span(range[0], range[1]) : tr('missing')),
    );
  }

  function showSeries(points, id, metric, limits, bibliography) {
    const metadata = METRICS[metric];
    const fullCoverage = areas[id].coverage?.[metric];
    const sourceKey = metric === 'cropland' && id.startsWith('HYDE_') ? 'croplandRegional' : metric;
    const source = provenance.sources[sourceKey];
    seriesTitle.textContent = `${tr('series')} · ${area(areas[id])} · ${tr(metric)}`;
    const description = node('p', 'hl-note', tr(`${sourceKey}Note`));
    const attribution = buildSources(ui, locale, source, bibliography, id);
    if (!points.length) {
      const detail = fullCoverage ? ` ${tr('available', { span: span(fullCoverage[0], fullCoverage[1]) })}` : '';
      seriesBody.replaceChildren(description, node('p', 'hl-empty', tr('empty') + detail), attribution);
      return;
    }

    const last = points.at(-1)[0];
    const first = points[0][0];
    const positive = points.filter(([, value]) => value > 0);
    const cutoff = select(tr('cutoff'), 'history-cutoff');
    if (positive.length >= 5) {
      for (const [date] of positive.slice(2, -2)) cutoff.input.append(option(date, year(date)));
      const trainCount = Math.max(3, positive.length - Math.max(2, Math.ceil(positive.length / 5)));
      cutoff.input.value = positive[trainCount - 1][0];
    } else {
      cutoff.wrapper.hidden = true;
    }

    const summary = node('p', 'hl-series-summary', tr('samples', {
      n: number(points.length), kind: tr(metadata.status), span: span(first, last),
    }));
    const frame = node('div', 'hl-chart');
    const legend = node('div', 'hl-legend');
    const yearField = select(tr('selectYear'), 'history-year');
    for (const [date] of points) yearField.input.append(option(date, year(date)));
    const readout = node('p', 'hl-readout');
    readout.setAttribute('aria-live', 'polite');
    const inspector = node('div', 'hl-inspect');
    inspector.append(yearField.wrapper, readout);
    const grid = table(tr('series'), [tr('year'), tr('value'), tr('status'), tr('source')]);
    const rangeStart = Math.max(ERA_START, limits[0]);
    const rangeEnd = Math.min(Math.max(...Object.values(areas.WORLD.coverage).map(entry => entry[1])), limits[1]);
    const rows = new Map();
    const pointRows = pointGaps(points, rangeStart, rangeEnd);
    for (const entry of pointRows) {
      const row = grid.body.insertRow();
      if (entry.missing) {
        row.className = 'hl-missing-row';
        row.insertCell().textContent = span(...entry.missing);
        row.insertCell().textContent = '—';
        row.insertCell().textContent = tr('missing');
        row.insertCell().textContent = '—';
        continue;
      }
      const { year: date, value } = entry;
      row.dataset.year = date;
      const pick = button(year(date), () => selectPoint(date), 'hl-text-button');
      row.insertCell().append(pick);
      row.insertCell().textContent = publishedValue(locale, metric, value);
      row.insertCell().textContent = tr(metadata.status);
      row.insertCell().textContent = tr(pointSource(metric, id, date));
      rows.set(date, { row, pick, value });
    }
    const backtest = node('section', 'hl-backtest');
    const heading = node('header', 'hl-section-header');
    heading.append(node('h4', '', tr('backtest')), cutoff.wrapper);
    const result = node('div');
    backtest.append(heading, result);

    let chartMarks = new Map();
    let fit;
    let selected;
    function selectPoint(date, scroll = false) {
      const previous = rows.get(selected);
      previous?.row.classList.remove('hl-selected');
      previous?.pick.setAttribute('aria-pressed', 'false');
      chartMarks.get(selected)?.classList.remove('hl-selected');
      const current = rows.get(date);
      if (!current) return;
      selected = date;
      yearField.input.value = date;
      current.row.classList.add('hl-selected');
      current.pick.setAttribute('aria-pressed', 'true');
      chartMarks.get(date)?.classList.add('hl-selected');
      const predicted = fit?.predictions?.find(entry => entry.year === date);
      readout.textContent = tr('selectedPoint', {
        year: year(date), value: publishedValue(locale, metric, current.value, true),
        kind: tr(metadata.status), source: tr(pointSource(metric, id, date)),
      }) + (predicted ? ` · ${tr('errorValues', {
        fit: publishedValue(locale, metric, predicted.model), flat: publishedValue(locale, metric, predicted.baseline),
      })}` : '');
      if (scroll) {
        grid.wrapper.scrollTop += current.row.getBoundingClientRect().top - grid.wrapper.getBoundingClientRect().top - 48;
      }
    }

    function runTest() {
      fit = backtestHistory(points, Number(cutoff.input.value));
      result.replaceChildren(backtestPanel(ui, locale, fit, metric));
      chartMarks = drawChart(frame, points, fit, metric, id, locale, date => selectPoint(date, true));
      const keys = [[metadata.status, metadata.status]];
      if (fit.status === 'ok') keys.push(['prediction', 'fit'], ['baseline', 'baseline']);
      legend.replaceChildren(...keys.map(([key, shape]) => node('span', `hl-key hl-key-${shape}`, tr(key))));
      selectPoint(selected ?? last, selected === undefined);
    }

    cutoff.input.addEventListener('change', runTest);
    yearField.input.addEventListener('change', () => selectPoint(Number(yearField.input.value), true));
    const exporter = button(tr('exportSeries'), () => exportSeriesCsv(id, metric, points), 'hl-text-button');
    exporter.dataset.export = 'series';
    seriesBody.replaceChildren(description, summary, exporter, frame, legend, node('p', 'hl-note', tr('noInterpolation')), inspector, grid.wrapper, backtest, attribution);
    if (points.some(([date]) => date === 0)) {
      grid.wrapper.after(node('p', 'hl-note', tr('epochNote', { zero: number(0) })));
    }
    runTest();
  }

  async function update() {
    const token = ++request;
    const id = regionField.input.value;
    const metric = metricField.input.value;
    const period = PERIODS[periodField.input.value];
    const coverage = areas[id].coverage?.[metric];
    const sites = evidence.filter(site => evidenceIn(site, id, period, areas));
    mapButton.disabled = !areas[id].mapId || !ctx.onSelect;
    showCoverage(sites);
    showSites(sites);
    seriesTitle.textContent = `${tr('series')} · ${area(areas[id])} · ${tr(metric)}`;
    if (!coverage || coverage[0] > period[1] || coverage[1] < period[0]) {
      status.textContent = '';
      showSeries([], id, metric, period);
      return;
    }
    status.textContent = tr('loadingSeries');
    seriesBody.replaceChildren();
    try {
      const [shard, bibliography] = await Promise.all([
        loadHistoryFile(`series/${id}.json`),
        metric === 'gdp' ? loadHistoryFile('maddison-sources.json') : null,
      ]);
      if (token !== request || !root.parentNode) return;
      const points = shard[metric].filter(([date]) => date >= period[0] && date <= period[1]);
      status.textContent = '';
      if (points.length) showCoverage(sites, [points[0][0], points.at(-1)[0]]);
      showSeries(points, id, metric, period, bibliography);
    } catch (error) {
      if (token !== request || !root.parentNode) return;
      status.textContent = tr('seriesFailed');
      seriesBody.replaceChildren(button(tr('retry'), () => void update()));
      console.error(error);
    }
  }

  for (const field of [regionField, metricField, periodField]) field.input.addEventListener('change', () => void update());
  return update();
}

export async function renderHistory(host, ctx = {}) {
  const doc = host.ownerDocument;
  const ui = elements(doc);
  const locale = localize(ctx);
  const { node, button } = ui;
  const { tr } = locale;
  attachStyles(doc);
  const root = node('section', 'history-lab');
  root.lang = locale.locale;
  const heading = node('header', 'hl-banner');
  heading.append(node('h2', '', tr('title')), node('p', '', tr('intro')));
  const status = node('p', 'hl-status', tr('loading'));
  status.setAttribute('role', 'status');
  root.append(heading, status);
  host.replaceChildren(root);
  try {
    const [catalog, evidence, provenance] = await Promise.all([
      loadHistoryFile('catalog.json'), loadHistoryFile('evidence.json'), loadHistoryFile('provenance.json'),
    ]);
    if (root.parentNode !== host) return;
    if (catalog.schema !== 1 || provenance.schema !== 1) throw new Error('Unsupported history archive schema');
    status.remove();
    await mountWorkbench(root, ctx, ui, locale, catalog, evidence, provenance);
  } catch (error) {
    if (root.parentNode !== host) return;
    status.textContent = tr('loadFailed');
    root.replaceChildren(heading, status, button(tr('retry'), () => void renderHistory(host, ctx)));
    console.error(error);
  }
}
