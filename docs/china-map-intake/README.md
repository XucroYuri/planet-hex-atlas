# 标准地图导入核验

本目录存放候选标准地图几何的**导入核验报告**，不存放地图数据本身。核验工具是 `pipeline/standard_map_intake.py`。

## 用途

当取得经授权的自然资源部标准地图矢量（或经审图的地图数据）后，先用本工具做前置检查，再进入人工审图和几何替换流程：

```sh
uv run pipeline/standard_map_intake.py \
  --geojson /path/to/authorized-map.geojson \
  --approval-number 'GS(2024)1234号' \
  --source-url https://example.org/source \
  --report docs/china-map-intake/report.json
```

## 检查项

- 审图号格式为 `GS(年份)编号号`；
- GeoJSON 为 FeatureCollection，几何仅接受 Polygon/MultiPolygon；
- 坐标为 WGS84 经纬度范围内的有限数值（投影坐标会被拒绝）；
- 至少包含标注为中国、台湾省、香港特别行政区、澳门特别行政区的要素；
- 北京、台湾本岛、香港九龙、澳门半岛、黄岩岛、东沙岛、太平岛、曾母暗沙、钓鱼岛九个样点必须落在对应行政区要素内。

## 边界

- 报告只说明“格式与样点落位通过，可进入人工审图”，**不构成审图结论**，不能据此宣称符合标准地图要求。
- 工具不会写入线上几何，不会替换底图；生产几何的替换必须同时完成审图号、授权范围与署名核验。
- `report.json` 默认被忽略，不提交；需要留档时复制为带日期与审图号的文件名并人工审阅。
