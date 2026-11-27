# 分级配色与自适应可视化

地图不是把数值线性映射到一条固定渐变色带。每个指标都有自己的分布形态：人口、GDP 和城市密度呈重尾，增长率有正负、预期寿命集中在高位、百分比指标有天然 0–100 边界、高程需要固定的地貌语义。若统一用“最小值–最大值”线性色带，少数极端值会把绝大多数地区压成同一种颜色，读者无法判断相对差异。

本页记录 `web/js/scales.js` 的算法、色板语义和验证方法。分级结果可在图例中直接审阅：图例始终显示分级方法、级数、每一级的数值区间与缺失数量。

## 处理流程

1. **采集与抽样**：国家档案使用当年全部有值地区（约 200–260 个）；格网图层从当前视图中按固定步长抽取最多约 1.2 万个格子，再以分位抽样压到 900 个用于标定，避免逐帧全量排序。
2. **分布诊断**：计算 2%、10%、25%、50%、75%、90%、98% 分位、四分位距（IQR）、偏度、零值比例和正负号。
3. **方法选择**：按语义与分布选择分级方法（见下表）。
4. **确定级数**：Freedman–Diaconis 规则给出初始级数，限制在 4–7 级；百分比指标 5 级；发散指标 7 级且零居中；高程固定 7 级。
5. **断点生成**：等距、分位数或 Fisher–Jenks 自然断点；重尾数据在对数空间生成断点，因此每级宽度几何递增。
6. **色彩映射**：在 OKLab 感知色彩空间中对预设色板插值，按等级中心取色，保证顺序色板的感知明度单调变化；发散色板以零为中心对称取样。
7. **标注与审计**：生成断点、每级计数、缺失数，并交给图例显示；图例的 `title` 提供每级占比。

## 分级方法决策

| 情形 | 方法 | 图例名称 | 理由 |
| --- | --- | --- | --- |
| 高程/水深 | 固定断点 | 固定分级 | 地貌语义稳定：深海、浅海、海平面、丘陵、高山、雪线不随年份变化 |
| 百分比指标，观测跨度 ≥ 35% 的 0–100 | 0–100 等距 | 百分比等距 | 保持跨指标可比，避免把 0–100 的语义压缩掉 |
| 百分比指标，观测集中在窄区间 | 0–100 内分位数 | 百分比分位数 | 在保留 0–100 上下文的同时提高组内区分度 |
| 同时有正负值（如增长率） | 对称发散 | 对称发散 | 零是语义中心；中心取 80% 分位绝对值，极端值饱和到最深两级 |
| 重尾非负值（人口、GDP、密度） | 对数空间等距/自然断点/分位数 | 对数等距分级等 | 读者比较的是倍数差异，不是绝对差 |
| 偏度大或明显成簇 | Fisher–Jenks 自然断点 | 自然断点 | 让同一级内部方差最小，边界落在数据空隙处 |
| 近似均匀 | 等距 | 等距分级 | 断点易读、可预测 |

定义域默认截尾在 2–98% 分位：首末两级为开放区间（图例显示 `≤`、`≥`），极端值仍使用最深颜色，不会被隐藏。图例明确标注“2–98% 截尾分级”。

对于零值占比超过 8% 的非负图层（如无居民陆地的人口密度），零值单独成级并显示为“0”，避免出现“≤ 0.0004”这类无意义的数值区间。

## 色板语义

顺序色板全部保持感知明度单调；发散色板以中性浅色居中，两端为深红与深青。色相按数据语义分组，避免“同一套蓝绿渐变套所有指标”：

| 色板 | 用于 | 色相语义 |
| --- | --- | --- |
| `magnitude` 琥珀 | GDP、人均 GDP、实际 GDP、谷物、制造业 | 经济总量与产出 |
| `plum` 紫 | 人口、城市人口、劳动年龄、老龄、女性、格网人口、密度 | 人口与聚居 |
| `lagoon` 青蓝 | 预期寿命、饮水、互联网、电力 | 民生服务与可及性 |
| `lilac` 粉紫 | 教育、卫生支出、研发、生育率 | 人力与社会投入 |
| `indigo` 靛蓝 | 工业、服务业、农业、贸易、失业率 | 产业结构与比例 |
| `terra` 苔绿 | 森林、耕地、可再生能源 | 土地与生态 |
| `solar` 金黄 | 用电量、电力可及率 | 能源 |
| `ember` 橙红 | 人均二氧化碳 | 排放与压力 |
| `balance` 红-米-青 | 实际经济增长 | 正负发散 |
| `hypso` 深海-雪线 | 海拔与水深 | 地貌高程 |

色板在 OKLab 中插值，避免 sRGB 插值造成的中间灰带；顺序色板的明度单调也保证在灰度打印和常见色觉障碍下仍可读出大小方向。分类色板（生态带）使用数据自带的分类色，不参与顺序映射。

## 为什么不用单一“好色带”

- 单一色带无法同时表达“总量（倍数）”“比例（0–100）”“变化（正负）”“地貌（语义断点）”。
- 线性 min–max 对重尾数据不稳健；对数等距把人口从“几个城市与大量空白”变成可读的倍数层级。
- 分位数分级每级样本数相近，适合看排名与相对位置；自然断点适合存在真实聚集的数据。算法按分布自动选择，并在图例中公开选择结果，读者可以判断解释是否合适。

## 验证

```sh
node --test tests/scales.test.mjs
uv run --with playwright python tests/visualization.browser.py http://127.0.0.1:8000/
```

单元测试覆盖：Jenks 断点正确性、均匀数据等距、重尾数据对数递增宽度、百分比 0–100 边界、发散对称与零中心、高程固定断点、缺失计数、色板明度单调与色板间感知差异、10 万值分类性能（<400 ms）。浏览器测试检查每个图层的图例级数、方法标签、缺失标记与色板差异。

## 局限

- 分级是描述性可视化，不是统计显著性检验；不同年份的断点会随当年分布变化，图例公开断点以便比较。
- 2–98% 截尾与开放区间会让极端值集中到首末级；这是为了整体可读性的取舍，不是隐藏数据。
- 格网图层的断点按当前视图抽样标定，缩放后会重算；这保证局部对比度，但也意味着不同缩放级别的颜色不完全可比，图例中的“按当前视图抽样标定”会提示这一点。
- 当前为 8 个顺序色板族与 1 个发散色板；若未来接入更多指标，应继续按语义分配而不是复用同一色带。

## 参考

- Harrower, M. & Brewer, C. A. (2003). ColorBrewer.org: An online tool for selecting colour schemes for maps. *The Cartographic Journal*. https://doi.org/10.1111/1467-8306.00310
- Brewer, C. A. & Pickle, L. (2002). Evaluation of methods for classifying epidemiological data on choropleth maps. *Annals of the Association of American Geographers*. https://bpb-us-e1.wpmucdn.com/sites.psu.edu/dist/1/84355/files/2024/05/Brewer-Pickle_2002_Epi-Choropleth-Classing_Annals.pdf
- Jenks, G. F. (1967). The data model concept in statistical mapping. *International Yearbook of Cartography* 7, 186–190.
- Freedman, D. & Diaconis, P. (1981). On the histogram as a density estimator. *Zeitschrift für Wahrscheinlichkeitstheorie* 57, 453–476.
- Ottosson, B. (2020). A perceptual color space for image processing (OKLab). https://bottosson.github.io/posts/oklab/
- Smith, N. & van der Walt, S. (2015). Viridis perceptually uniform colour maps. https://cran.r-project.org/web/packages/viridis/vignettes/intro-to-viridis.html
- D3 scale-chromatic (sequential, diverging and categorical reference schemes). https://github.com/d3/d3-scale-chromatic
- ColorBrewer 2.0. https://colorbrewer2.org/
