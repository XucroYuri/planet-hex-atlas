# TWSE 市场历史来源与授权

提供机构为台湾金融监督管理委员会证券期货局及台湾证券交易所。`index.json` 记录本版所含日期、数据范围、来源链接和数据格式版本。此数据依台湾政府资料开放授权条款第 1 版提供，使用者遵守条款后可利用。[政府资料开放授权条款](https://data.gov.tw/license)

- 日行情包括台湾证交所个股日成交资讯、每日收盘行情，以及个股按月查询的每日成交资讯。[官方目录 11549](https://data.gov.tw/dataset/11549)、[每日收盘行情](https://www.twse.com.tw/en/trading/historical/mi-index.html)、[按月查询](https://www.twse.com.tw/en/trading/historical/stock-day.html)
- 估值来自同日同代码的个股估值报告，日行情本身的有效市盈率也属于同日资料。[官方目录 11547](https://data.gov.tw/dataset/11547)、[官方目录 11764](https://data.gov.tw/dataset/11764)
- 外币 ETF 使用成交币种。币种字段缺失时，按 TWSE 代码和简称中的币种标识处理。[双币 ETF 交易机制](https://www.twse.com.tw/zh/products/system/dual-etf/introduction.html)

## 重建

```sh
python3 pipeline/market_data.py --input /path/to/twse-cache --output web/data/markets
node --test tests/market.test.mjs
```

缓存目录可包含 `archive/YYYYMMDD.json`（`MI_INDEX`）、`ratios/YYYYMMDD.json`（`BWIBBU_d`）、`stock-<code>-<yyyymm>.json`（`STOCK_DAY`）、`tw-history.json` 和 `tw-prices.json`、`tw-ratios.json`、`tw-month.json`、`tw-archive.json` 快照。

同一证券及日期只保留一条日行情，优先使用 `archive/` 的个股行情。脚本转换公历与民国日期，整理数值并按代码和交易日合并估值。缺失值保留为 `null`。没有行情的日期不生成记录。`index.json` 的 `fields` 与行情数组的列序对应，股息率以百分数记录。
