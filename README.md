# 地球六角志 · Orbis Atlas

在真实地球上浏览《文明》式六角地块、城市、港口、电厂和世界遗产，比较历史指标，再从同一观测起点试验不同政策。中文界面，桌面和移动端均可使用。[正式站点](https://earth.xuyu.net) · [Cloudflare Pages](https://planet-hex-atlas.pages.dev)

## 从哪里开始

- 旋转地球或切换「展图」。滚轮、双指或加减按钮可缩放，在局部视野中使用分层 H3 瓦片。聚焦地图后，方向键平移，回车打开中心位置的档案。
- 按 `/` 搜索城市、地图地域或世界遗产。城市档案展示 100 公里范围内的设施、装机结构与遗产组件。分享按钮生成带镜头、图层、年份和选中位置的链接。
- 在「地形」菜单中选择专题或叠加设施。时间轴联动国家与地区统计。数据台支持同年散点、排序表、两地历史折线、定位地图和 CSV 下载。
- 在「百年推演」为两条政策分支分配预算，与固定配比基线比较七个指标。可设置森林底线、查看规则、回放及导入导出实验。浏览器本地保存实验。
- 在「地方议事」用同一起点比较两条路线。街坊圈、工坊圈和水岸圈只收到各自可见的信号。政策影响资源、服务与生态，信号经过有延迟的传播边和接受阈值。实验可逐回合核对收支、信号、门槛与结果。

## 数据范围

截至 2026-11-27 的快照，包含 258 个 Natural Earth 地图地域、216 个独立匹配的世界银行统计经济体和 29 个年度指标。年份控件覆盖 1960–2025；不同指标的有值年份不同。各指标仅比较选定年份，缺失保留为空。

- H3 R2、R3 和 R4 的全球格数分别为 5,882、41,162 和 288,122。R4 平均边长约 26 公里。含南极、两极、海洋以及跨日期变更线的格子。
- 2020 年 GHSL 1 公里人口像素按像素中心归入 R4。父层按逻辑子格加总。R4 合计约 78.41 亿人。世界银行年度人口及世界总量采用独立序列。
- 13,956 个 GeoNames 城市与居民点、1,081 个港口、3,268 个有定期航班的大中型机场、34,936 座 WRI 电厂。
- UNESCO 名录包含 1,273 项。1,271 项具有可用坐标，共生成 6,059 个组件点。多组件遗产可以占多个位置。
- 地形采用 GMT 分发的 SRTM15+ v2.7 六弧分滤波高程，生态带采用 RESOLVE 2017，冰川覆盖采用 Natural Earth。R4 格在中心位置取样，陆地比例以 7 点抽样估算；粗分辨率高程为面积加权汇总。
- 国家产出账簿将谷物产量、名义 GDP、制造业增加值与研发支出对应到粮食、金币、工坊与科学。研发支出按同年 GDP 乘以研发支出率估算。城市城区图标依据周边设施记录出现，建筑轮廓表示人口等级。

地区边界和年度统计单位有不同的口径。地区统计用于国家与地区专题着色，通过格网查看地区数字时仍保留其原始空间尺度。GeoNames 居民点人口的参考年份随记录而异。电厂容量来自 2021 年版名录。推演使用的系数、群体和接受门槛均为虚构机制；人口与经济观测本身无法校准这些机制的因果效力。

[来源与许可](web/data/ATTRIBUTION.txt) · [输入地址和 SHA-256](web/data/source-lock.json) · [数据清单](web/data/atlas.json)

## 运行、重建和发布

前端是静态 ES modules 和 Canvas 2D。所有运行时资源从本站读取，打开地图或运行推演均无需 API Key。球面总览与平面下钻共用底图和格网；城市、地形、机场和港口的画笔移植自 MIT 许可的 usaciv。[原作](https://karpathy.ai/usaciv/) · [原作许可](web/vendor/usaciv/LICENSE.txt)

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory web
```

已提交静态数据，通常直接启动即可。重建需 Python 3.11+、uv、网络及存放原始人口栅格的本地空间。下载缓存按文件名复用，重新取得动态源时使用新的缓存目录，并对照上一版的 SHA-256。

```sh
uv sync --frozen
uv run --frozen python pipeline/build.py --download --cache .cache
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
