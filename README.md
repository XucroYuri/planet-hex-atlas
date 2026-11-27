# 寰宇图志 · Orbis Atlas

在真实地球上浏览《文明》式六角地块、城市、港口、电厂和世界遗产，比较历史指标，并可把当前地图导出为带署名的 PNG 图像，再从同一观测起点试验不同政策。桌面和移动端均可使用，界面提供 41 种语言。[正式站点](https://earth.xuyu.net) · [Cloudflare Pages](https://planet-hex-atlas.pages.dev)

## 从哪里开始

- 旋转地球或切换「展图」。滚轮、双指或加减按钮可缩放，在局部视野中使用分层 H3 瓦片。聚焦地图后，方向键平移，回车打开中心位置的档案。
- 按 `/` 搜索城市、地图地域或世界遗产。城市档案展示 100 公里范围内的设施、装机结构与遗产组件。分享按钮生成带镜头、图层、年份和选中位置的链接。
- 在「地形」菜单中选择专题或叠加设施。时间轴联动国家与地区统计。数据台支持同年散点、排序表、两地历史折线、定位地图和 CSV 下载。
- 在「百年推演」为两条政策分支分配预算，与固定配比基线比较七个指标。可设置森林底线、查看规则、回放及导入导出实验。浏览器本地保存实验。
- 在「地方议事」用同一起点比较两条路线。街坊圈、工坊圈和水岸圈只收到各自可见的信号。政策影响资源、服务与生态，信号经过有延迟的传播边和接受阈值。实验可逐回合核对收支、信号、门槛与结果。

## 安装与离线

站点是可安装的 PWA：浏览器可将其添加到桌面/主屏，Service Worker 缓存内容寻址的静态资产；首次在线加载并再次访问后，断网仍可打开已缓存的地图外壳与数据。离线测试：`uv run --with playwright python tests/offline.browser.py <url>`；安装元数据测试：`tests/pwa.browser.py`。

## 界面语言

界面提供 41 种语言：简体中文、繁体中文、英语、西班牙语、法语、日语、韩语、阿拉伯语为人工整理词条；其余 33 种（德语、葡萄牙语、印地语、俄语、印尼语、意大利语、土耳其语、越南语、孟加拉语、乌克兰语、波兰语、波斯语、乌尔都语、斯瓦希里语、荷兰语、泰语、希伯来语、希腊语、捷克语、罗马尼亚语、匈牙利语、瑞典语、丹麦语、芬兰语、挪威语、保加利亚语、克罗地亚语、斯洛伐克语、斯洛文尼亚语、立陶宛语、拉脱维亚语、爱沙尼亚语、泰米尔语）由离线机器翻译生成静态词包，在语言菜单标注 `· MT`，缺失文案回退英语。品牌名保留 `Orbis Atlas` 作为专名，中文为“寰宇图志”。阿拉伯语、希伯来语、波斯语、乌尔都语使用 RTL 布局。语言选择按 `?lang=`、已保存偏好、浏览器语言的顺序解析，不向第三方翻译服务发送内容。

## 长时段历史、太空与市场

「更多研究」汇集按需加载的四个工作台：

- 深时历史：10 处带论文与测年区间的早期人类证据；覆盖 233 个地区和汇总区的历史人口，最早估计为公元前 10,000 年。人均 GDP、耕地与牧场面积、可耕地、预期寿命与成人识字率分别保留其来源时间点；预期寿命长序列中的英国样本可追溯至 1543 年、全球合计自 1770 年起、中国自 1930 年起，识字率为 1975 年以来的调查年份序列。按实际年距拟合，并与留后区间的持平基线比较；缺失不自动插值。最早证据与第一批数值序列之间存在覆盖断层。
- 太空足迹：用 NASA/JPL Horizons 的日心黄道 J2000 三维年度星历浏览八大行星、旅行者、先驱者和新视野号。每个样本对应 11 月 27 日 00:00 TDB；报告日心与离地距离、真空单程光行时。失联探测器的后续位置为轨道模型估计。另列阿尔忒弥斯 II 的载人离地纪录、理想信号光前沿，以及 1957–2025 年按登记国/组织统计的年度入轨物体序列（联合国 UNOOSA 经 OWID 汇编，共 24,865 个；2025 年 4,510 个）。
- 证券日历：当前包含台湾证交所 1,404 只证券、54,382 条逐日记录，范围为 2026-01-02 至 2026-11-27 的 218 个有记录交易日，估值仅在同日匹配。仅 2330 和 2317 的月档覆盖 2026 年 1–9 月；其他证券在 2026 年 10–11 月有全市场日档，不能把这段样本当成完整全球行情。股票未经过复权，也不代表投资建议。
- 数据覆盖：「更多研究 → 数据愿望清单」按所选年份统计 29 项年度指标的有值地区与覆盖率，并链接世界银行指标代码；另列出 7 条历史序列的地区数、发布值、全球范围与来源站点；愿望项逐条给出当前证据、取得渠道与下一项接入条件；页底提供当前年度观测、历史目录、太空发射、市场目录与来源清单的原始 JSON 下载。历史工作台还可把当前序列导出为 CSV。
- 本地市场：在「本地 A 股」中选择 UTF-8 / GB18030 CSV 或 ZIP。浏览器只解析 ZIP 目录和所选证券的压缩数据；输入文件与内容不会上传。已用 370 MB 真实档案验证：4,953 只证券约 0.1 秒完成索引，浦发银行 5,327 条日记录（1999-11-10 至 2022-04-29），文件不上传。

[历史来源与许可](web/data/history/provenance.json) · [行情来源与许可](web/data/markets/SOURCES.md) · [行情输入摘要](web/data/markets/source-lock.json) · [JPL 星历](web/data/space/ephemeris.json)

## 数据范围

截至 2026-11-27 的快照，包含 258 个 Natural Earth 地图地域、216 个独立匹配的世界银行统计经济体和 29 个年度指标。年份控件覆盖 1960–2025；不同指标的有值年份不同。各指标仅比较选定年份，缺失保留为空。

- H3 R2、R3 和 R4 的全球格数分别为 5,882、41,162 和 288,122。R4 平均边长约 26 公里。含南极、两极、海洋以及跨日期变更线的格子。
- 2020 年 GHSL 1 公里人口像素按像素中心归入 R4。父层按逻辑子格加总。R4 合计约 78.41 亿人。世界银行年度人口及世界总量采用独立序列。
- 13,956 个 GeoNames 城市与居民点、1,081 个港口、3,268 个有定期航班的大中型机场、34,936 座 WRI 电厂。
- UNESCO 名录包含 1,273 项。1,271 项具有可用坐标，共生成 6,059 个组件点。多组件遗产可以占多个位置。
- 地形采用 GMT 分发的 SRTM15+ v2.7 六弧分滤波高程，生态带采用 RESOLVE 2017，冰川覆盖采用 Natural Earth。R4 格在中心位置取样，陆地比例以 7 点抽样估算；粗分辨率高程为面积加权汇总。
- 国家产出账簿将谷物产量、名义 GDP、制造业增加值与研发支出对应到粮食、金币、工坊与科学。研发支出按同年 GDP 乘以研发支出率估算。城市城区图标依据周边设施记录出现，建筑轮廓表示人口等级。
- 中国地区档案优先展示国家统计局人民币 GDP 长序列：1978–2022 年来自《中国统计年鉴 2024》表 3-1（当年价），2023 年经普修订数 1,294,272 亿元、2024 年最终核实 1,348,066 亿元、2025 年初步核算 1,401,879 亿元。该统计范围不含香港、澳门特别行政区和台湾省的地区生产总值。2024、2025 年另列统计公报的年末全国人口与城镇常住人口；2025 年还列人均 GDP、国民总收入、全员劳动生产率、粮食产量、货物进出口、社会消费品零售、研发经费、居民人均可支配收入（含城乡）、城镇化率与四大区域 GDP，并可把 48 年官方序列导出为带来源链接的 CSV，更早人口序列待官方机器可读来源；跨地区比较仍使用世界银行美元序列，两个口径不混算。年鉴表格以图片发布，`pipeline/china_gdp_series.py` 在 macOS 上用 Vision OCR 提取并做锚点、三次产业加总与单调性校验后可重建。
- 中文规范命名与行政层级已按中国官方口径写入数据：台湾省（province）、香港特别行政区（sar）、澳门特别行政区（sar）、黄岩岛（reef），`sovereignId` 均为中国。此改动只涉及命名与层级元数据，不改变边界几何。

地区边界和年度统计单位有不同的口径。地区统计用于国家与地区专题着色，通过格网查看地区数字时仍保留其原始空间尺度。GeoNames 居民点人口的参考年份随记录而异。电厂容量来自 2021 年版名录。推演使用的系数、群体和接受门槛均为虚构机制；人口与经济观测本身无法校准这些机制的因果效力。

[来源与许可](web/data/ATTRIBUTION.txt) · [输入地址和 SHA-256](web/data/source-lock.json) · [数据清单](web/data/atlas.json)

## 分级配色与自适应可视化

地图不同用一套固定渐变套所有指标，而是按指标语义与统计分布自动选择配色和分级（实现见 `web/js/scales.js`，方法与参考见 [docs/visualization.md](docs/visualization.md)）：

- **色板按语义分组**：经济总量用琥珀、人口与密度用紫色、民生服务用青蓝、人力投入用粉紫、产业结构用靛蓝、生态用苔绿、能源用金黄、排放用橙红、增长率用红-米-青发散、高程用深海-雪线。顺序色板在 OKLab 中插值并保持明度单调，灰度与常见色觉障碍下仍可读。
- **分级按分布自动选择**：高程用固定地貌断点；百分比指标保留 0–100 语义并在数据集中时改用分位数；正负增长用零中心对称发散；人口、GDP、密度等重尾数据在对数空间分级；偏斜成簇时用 Fisher–Jenks 自然断点，近似均匀时用等距。
- **图例公开算法**：显示分级方法、级数、每一级区间、缺失数量；默认 2–98% 截尾，首末级为开放区间，极端值饱和显示而不隐藏。零值占比高的图层（如无人陆地的人口密度）把 0 单列一级。
- **可验证**：`node --test tests/scales.test.mjs` 覆盖断点、单调明度、色板区分度与 10 万值分类性能；`uv run --with playwright python tests/visualization.browser.py <url>` 在真实浏览器中核对图例与色板差异；`uv run --with playwright python tests/performance.browser.py <url>` 检查桌面与限速移动端的 LCP、CLS、传输量和预加载顺序；`uv run --with playwright python tests/a11y.browser.py <url>` 用内置 axe-core 对地图、地区档案、标准弹窗与研究页做 WCAG A/AA 审计。

## 地图标准、中国经济基准与反馈

本站是使用公开数据制作的**科学可视化交互地图**，不是经自然资源主管部门审核的标准地图，未取得审图号，不作为任何领土主张或边界表达的依据。底图边界仍来自 Natural Earth，与官方标准地图存在差异（台湾省、香港、澳门目前为独立 Natural Earth 地域，黄岩岛等岛礁的图形未对齐权威图幅）。在取得审图号或获授权使用已审核图幅之前，本站不会声称符合中国标准地图。核查记录与逐项整改条件见 [docs/china-standards.md](docs/china-standards.md)，可重复审计：

```sh
PYTHONPATH=. uv run python pipeline/china_source_audit.py --json
PYTHONPATH=. uv run python tests/china_source_audit_test.py
```

应用内「标准与声明」页公开当前合规状态，并提供仅在本机运行的标准地图图片对照（填写审图号、不上传）；「反馈与数据建议」页在浏览器本地整理内容，点击后打开预填的 GitHub issue，由提交者确认发布，不经过本站服务器、不收集个人信息。反馈 issue 使用 `feedback` 标签；审查脚本只读获取 issue、把正文视为未信任文本，并在 `feedback/review-drafts/` 生成本地建议草案，供开发者审核。经核验的结论用 `feedback/promote.mjs` 写入 [`docs/feedback-recommendations/`](docs/feedback-recommendations/README.md)（每条包含 issue 链接、决策、证据、影响与后续动作，不复制 issue 正文），并用 `index.json` 去重。另有每日定时任务检查新反馈，无变化时安静结束。

[反馈通道说明](docs/feedback.md) · [中国标准核查](docs/china-standards.md) · [标准地图送审路径](docs/china-map-submission/README.md)

## 自动验证

每次推送 `main` 会在 GitHub Actions 运行两组校验：

```bash
npm test                # Node 单元测试、数据一致性、i18n 词表（116+ 项）
npm run verify:pipeline # 发布隔离/URL 规则 + 中国数据来源核查
```

浏览器级检查（本地或已部署域名）需要 Playwright：

```bash
uv run --with playwright python tests/browser_smoke.py https://earth.xuyu.net/
uv run --with playwright python tests/a11y.browser.py https://earth.xuyu.net/
```

## 运行、重建和发布

前端是静态 ES modules 和 Canvas 2D。所有运行时资源从本站读取，打开地图或运行推演均无需 API Key。球面总览与平面下钻共用底图和格网；城市、地形、机场和港口的画笔移植自 MIT 许可的 usaciv。[原作](https://karpathy.ai/usaciv/) · [原作许可](web/vendor/usaciv/LICENSE.txt)

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory web
```

已提交静态数据，通常直接启动即可。重建需 Python 3.11+、uv、网络及存放原始人口栅格的本地空间。下载缓存按文件名复用，重新取得动态源时使用新的缓存目录，并对照上一版的 SHA-256。

```sh
uv sync --frozen
uv run --frozen python pipeline/build.py --download --cache .cache
uv run python pipeline/china_gdp_series.py --cache .cache/china
uv run --frozen python pipeline/verify.py
node --test tests/*.test.mjs
npm --prefix mcp ci --ignore-scripts
npm --prefix mcp test
# 另开终端，启动上面的本地 HTTP 服务后运行浏览器验收（需安装 Chrome）
uv run tests/browser_smoke.py http://127.0.0.1:8000/
npx wrangler@4 pages deploy web --project-name planet-hex-atlas --branch main
```

H3 瓦片头包含 `HXA1` 和小端 uint32 记录数。每条记录 20 字节，依次为 H3 uint64、高程 int16、地域 uint16、生态带 uint8、陆地比例 uint8、人口 float32、保留 uint16。比例除以 255 恢复到 0–1。R3/R4 按格心所在的 20° 瓦片按需加载，R2 全景一次读取。

## 本地 MCP

Node.js 22+。在 MCP 客户端配置 `node /absolute/path/to/mcp/server.mjs` 为 stdio 命令，将 `ORBIS_ROLE` 设为 `residents`、`workers` 或 `stewards`。每个服务进程绑定一个角色。使用上面的 `npm ci` 安装 SDK。地图的浏览器界面直接运行同一套确定性模型。

| 工具 | 用途 |
| --- | --- |
| `orbis_search` | 查地区或指标 ID |
| `orbis_read_observations` | 读取指定年份的实测值、单位与来源 |
| `orbis_observe_council` | 按行动记录复演，读取本角色的观测 |
| `orbis_check_proposal` | 核验预算与政策可行性 |
| `orbis_advance_council` | 推进一步，返回新的可复演行动记录 |
| `orbis_read_turns` | 分页读取本角色能看到的回合记录 |

起始记录示例为 `{"modelVersion":1,"region":"CHN","year":2023,"seed":8,"actions":[]}`。从同一条记录提交不同合法行动即可分叉。MCP 只交换经过规则校验的动作和角色观测。公开站点的百年实验与地方议事都可直接体验，MCP 入口在本地运行。
