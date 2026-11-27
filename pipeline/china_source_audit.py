"""只读核查现有图谱的中国地图与经济数据来源。"""

import argparse
import hashlib
import json
import math
import re
import struct
import sys
from pathlib import Path


DATA_DIR = Path(__file__).resolve().parents[1] / "web" / "data"
HEADER = struct.Struct("<4sI")
RECORD = struct.Struct("<QhHBBfH")
REGIONS = ("CHN", "TWN", "HKG", "MAC", "SCR")
METRICS = ("gdp", "gdpReal", "income", "growth", "grain", "manufacture", "research")
SOURCE_FILES = ("atlas-country.zip", "regions.json", "wdi-gdp.zip")
ADMIN_LEVELS = {"TWN": "province", "HKG": "sar", "MAC": "sar"}
AUDITED_DETAIL_SHA256 = "c3c1e864f077898dc0a7d9ea209ea1424967d647d539e03825e7da62237d73e4"

NBS_GDP = {
    2023: (1294272, "经济普查修订", "2024-12-27", "https://www.stats.gov.cn/sj/zxfb/202412/t20241227_1957915.html"),
    2024: (1348066, "最终核实", "2025-12-26", "https://www.stats.gov.cn/sj/zxfb/202512/t20251226_1962144.html"),
    2025: (1401879, "初步核算", "2026-02-28", "https://www.stats.gov.cn/sj/zxfb/202602/t20260228_1962662.html"),
}

PROBES = {
    "北京": ((116.40, 39.90), "8231affffffffff", ("6-14", "8331aafffffffff"), ("6-14", "8431aa5ffffffff")),
    "台湾本岛": ((120.95, 23.70), "824ba7fffffffff", ("5-15", "834ba2fffffffff"), ("5-15", "844ba23ffffffff")),
    "香港九龙": ((114.17, 22.32), "82411ffffffffff", ("5-14", "83411cfffffffff"), ("5-14", "84411cbffffffff")),
    "澳门半岛西侧": ((113.533, 22.188), "82411ffffffffff", ("5-14", "834103fffffffff"), ("5-14", "8441037ffffffff")),
    "中建岛": ((111.205, 15.785), "826927fffffffff", ("5-14", "836923fffffffff"), ("5-14", "8469207ffffffff")),
    "黄岩岛": ((117.754, 15.151), "826977fffffffff", ("5-14", "836971fffffffff"), ("5-14", "8469715ffffffff")),
    "东沙岛": ((116.73, 20.70), "824137fffffffff", ("5-14", "834133fffffffff"), ("5-14", "8441315ffffffff")),
    "太平岛": ((114.36, 10.38), "82691ffffffffff", ("4-14", "83691bfffffffff"), ("5-14", "84691bbffffffff")),
    "曾母暗沙附近": ((112.50, 3.97), "8268a7fffffffff", ("4-14", "8368a4fffffffff"), ("4-14", "8468a4dffffffff")),
    "钓鱼岛附近": ((123.475, 25.745), "824b17fffffffff", ("5-15", "834b13fffffffff"), ("5-15", "844b135ffffffff")),
}


def read_json(path):
    return json.loads(path.read_bytes())


def read_generated(path, root, missing, reader):
    try:
        return reader(path)
    except FileNotFoundError:
        missing.append(path.relative_to(root).as_posix())
        return None


def ring_contains(ring, lon, lat):
    crossings = 0
    for start, end in zip(ring, ring[1:] + ring[:1]):
        start_lon, start_lat = start
        end_lon, end_lat = end
        if (start_lat > lat) != (end_lat > lat):
            crossing_lon = start_lon + (end_lon - start_lon) * (lat - start_lat) / (end_lat - start_lat)
            crossings += crossing_lon > lon
    return crossings % 2


def outline_hits(outlines, regions, lon, lat):
    return [
        region["id"]
        for region, polygons in zip(regions, outlines, strict=True)
        if sum(ring_contains(ring, lon, lat) for polygon in polygons for ring in polygon) % 2
    ]


def decode_tile(blob, region_ids, path):
    if len(blob) < HEADER.size:
        raise ValueError(f"{path} 缺少 HXA1 文件头")
    magic, count = HEADER.unpack_from(blob)
    if magic != b"HXA1" or len(blob) != HEADER.size + count * RECORD.size:
        raise ValueError(f"{path} 的 HXA1 文件头或记录长度无效")
    rows = {}
    for cell, _, region, _, land, _, _ in RECORD.iter_unpack(blob[HEADER.size:]):
        if region > len(region_ids) or cell in rows:
            raise ValueError(f"{path} 的格网区域索引越界或格网 ID 重复")
        rows[cell] = {"region": region_ids[region - 1] if region else None, "landByte": land}
    return rows


def audit_geography(root, atlas, missing):
    regions = atlas["countries"]
    region_ids = [region["id"] for region in regions]
    if not region_ids or len(region_ids) != len(set(region_ids)):
        raise ValueError("atlas.json 的区域 ID 为空或重复")
    detail_bytes = (root / "outlines.json").read_bytes()
    detail = json.loads(detail_bytes)
    overview_file = read_generated(root / "overview.json", root, missing, read_json)
    overview = overview_file["outlines"] if overview_file is not None else None
    if len(detail) != len(regions) or (overview is not None and len(overview) != len(regions)):
        raise ValueError("轮廓数组长度与 atlas.json 的区域索引不一致")

    tiles = {}
    probes = {}
    for name, (point, world, r3, r4) in PROBES.items():
        cells = {}
        for level, (tile, cell) in zip(("2", "3", "4"), (("world", world), r3, r4), strict=True):
            relative_path = f"h{level}/{tile}.bin"
            if relative_path not in tiles:
                if tile not in atlas["tiles"].get(level, []):
                    missing.append(f"atlas.json#tiles/{level}/{tile}")
                blob = read_generated(root / relative_path, root, missing, Path.read_bytes)
                tiles[relative_path] = None if blob is None else decode_tile(blob, region_ids, relative_path)
            rows = tiles[relative_path]
            packed = None if rows is None else rows.get(int(cell, 16))
            if rows is not None and packed is None:
                missing.append(f"{relative_path}#{cell}")
            cells[level] = {"id": cell, "file": relative_path, "record": packed}
        probes[name] = {
            "lonLat": point,
            "detail": outline_hits(detail, regions, *point),
            "overview": None if overview is None else outline_hits(overview, regions, *point),
            "h3": cells,
        }

    focus = {}
    for index, row in enumerate(regions):
        if row["id"] in REGIONS:
            focus[row["id"]] = {
                "packedIndex": index + 1,
                "outlineParts": len(detail[index]),
                **{key: row.get(key) for key in (
                    "zh", "name", "iso2", "wdi", "bounds", "neighbors", "parentId", "sovereignId", "adminLevel",
                )},
            }
    return {
        "regionCount": len(regions),
        "detailSha256": hashlib.sha256(detail_bytes).hexdigest(),
        "wdiMappings": len({row["wdi"] for row in regions if row.get("wdi")}),
        "regionsWithAdminLevel": sum(row.get("adminLevel") is not None for row in regions),
        "regions": focus,
        "probes": probes,
    }


def numeric_value(value):
    if value is not None and (type(value) not in (int, float) or not math.isfinite(value)):
        raise ValueError("经济观测必须是有限数值或 null")
    return value


def audit_economy(root, atlas, years, selected, missing):
    observations = read_json(root / "observations.json")
    metrics = {
        metric["id"]: {field: metric.get(field) for field in ("code", "unit", "updated")}
        for metric in atlas["metrics"] if metric["id"] in METRICS
    }
    region_ids = tuple(row["id"] for row in atlas["countries"])
    gdp = {}
    for region in region_ids:
        series = observations.get(region, {}).get("gdp", [None] * len(years))
        if len(series) != len(years):
            raise ValueError(f"observations.json 的 {region}/gdp 与年份轴长度不一致")
        gdp[region] = [numeric_value(value) for value in series]

    coverage = {}
    for region in REGIONS:
        values = {}
        for metric in METRICS:
            series = observations.get(region, {}).get(metric, [None] * len(years))
            observed = [year for year, value in zip(years, series, strict=True) if numeric_value(value) is not None]
            values[metric] = {"first": min(observed, default=None), "last": max(observed, default=None), "count": len(observed)}
        coverage[region] = values

    annual = {}
    differences = []
    reference_years = sorted({selected, *(year for year in NBS_GDP if year in years)})
    for year in reference_years:
        index = years.index(year)
        shard = read_generated(root / f"annual/{year}.json", root, missing, read_json)
        if shard is not None and shard["year"] != year:
            raise ValueError(f"annual/{year}.json 的 year 字段不一致")
        rows = None if shard is None else shard["regions"]
        values = {}
        annual[year] = {
            "regionsWithGdp": sum(gdp[region][index] is not None for region in region_ids),
            "annualShardPresent": rows is not None,
            "values": values,
        }
        for region in REGIONS:
            row = observations.get(region, {})
            values[region] = {metric: row[metric][index] if metric in row else None for metric in METRICS}
        if rows is not None:
            for region in region_ids:
                expected = {"gdp": gdp[region][index], **values.get(region, {})}
                for metric, value in expected.items():
                    shard_value = numeric_value(rows.get(region, {}).get(metric))
                    if shard_value != value:
                        differences.append({"year": year, "region": region, "metric": metric, "annual": shard_value, "series": value})

    official_path = root / "china-official.json"
    official = read_json(official_path) if official_path.is_file() else None
    if official is not None:
        official = {
            **{key: official.get(key) for key in ("referenceYear", "published", "revision", "currency", "unit", "scope", "url")},
            "gdp": official.get("values", {}).get("gdp"),
        }
    return {
        "metrics": metrics,
        "coverage": coverage,
        "annual": annual,
        "annualDifferences": differences,
        "localReference": official,
        "nbsReference": {
            "unit": "亿元人民币",
            "priceBasis": "当年价格",
            "scope": "国家统计局全国年度 GDP，未纳入香港、澳门特别行政区和台湾省地区生产总值",
            "years": {
                year: {"gdp": value, "revision": revision, "published": published, "url": url}
                for year, (value, revision, published, url) in NBS_GDP.items()
            },
        },
    }


def audit(root, year=None):
    atlas_bytes = (root / "atlas.json").read_bytes()
    atlas = json.loads(atlas_bytes)
    years = atlas["years"]
    if not years or sorted(set(years)) != years or any(type(value) is not int for value in years):
        raise ValueError("atlas.json 的统计年份轴应为递增且不重复的整数")
    selected = atlas["year"] if year is None else year
    if selected not in years:
        raise ValueError(f"年份 {selected} 不在 atlas.json 的统计年份轴内")

    lock = read_json(root / "source-lock.json")
    sources = {
        name: {"atlasUrl": atlas["sources"].get(name), "lockedUrl": lock.get(name, {}).get("url"),
               "sha256": lock.get(name, {}).get("sha256")}
        for name in SOURCE_FILES
    }
    missing = []
    geography = audit_geography(root, atlas, missing)
    economy = audit_economy(root, atlas, years, selected, missing)
    blockers = {}
    boundary_source = sources["atlas-country.zip"]
    if any("naturalearth" in (boundary_source[key] or "").casefold() for key in ("atlasUrl", "lockedUrl")):
        blockers["MAP_SOURCE"] = "现有边界输入为 Natural Earth ADM0。"
    if geography["detailSha256"] == AUDITED_DETAIL_SHA256:
        blockers["LEGACY_GEOMETRY"] = "详细轮廓仍与本次审计的 Natural Earth 产物字节一致。"
    if any(not source["atlasUrl"] or source["atlasUrl"] != source["lockedUrl"]
           or not re.fullmatch(r"[0-9a-fA-F]{64}", source["sha256"] or "") for source in sources.values()):
        blockers["SOURCE_LOCK"] = "边界或 WDI 输入缺少来源锁，或清单的来源 URL 与来源锁不同。"
    hierarchy_gaps = [
        region for region, level in ADMIN_LEVELS.items()
        if geography["regions"].get(region, {}).get("sovereignId") != "CHN"
        or geography["regions"].get(region, {}).get("adminLevel") != level
    ]
    if hierarchy_gaps:
        blockers["ADMIN_HIERARCHY"] = f"区域层级或中国归属字段缺失或有差异（{', '.join(hierarchy_gaps)}）。"
    probes = geography["probes"]
    if ("SCR" in probes["黄岩岛"]["detail"] and geography["regions"].get("SCR", {}).get("sovereignId") != "CHN"
            or any(not probes[name]["detail"] for name in ("东沙岛", "太平岛"))):
        blockers["ISLAND_GEOMETRY"] = "岛礁轮廓样点有独立区域命中或无命中，须对照权威图幅和符号图层。"
    if economy["metrics"].get("gdp", {}).get("code") == "NY.GDP.MKTP.CD":
        blockers["WDI_GDP_BASIS"] = "现有年度 GDP 使用 WDI 当年美元口径，需落实中国官方经济基准。"
    if economy["annual"][selected]["values"]["TWN"]["gdp"] is None:
        blockers["TAIWAN_GDP_MISSING"] = f"{selected} 年台湾省 GDP 缺值，须采用可追溯数据或经核定的缺失注记。"
    if economy["annualDifferences"]:
        blockers["ANNUAL_DRIFT"] = "年度分片与观测序列存在差异。"
    reference = economy["localReference"]
    if reference is not None and reference["referenceYear"] in NBS_GDP:
        gdp, revision, published, _ = NBS_GDP[reference["referenceYear"]]
        if (reference["gdp"], reference["revision"], reference["published"], reference["currency"], reference["unit"]) != (
            gdp, revision, published, "CNY", "亿元",
        ):
            blockers["NBS_REFERENCE_DRIFT"] = "本地中国官方资料卡与公告锚点的版本、单位或总量不同。"
    if missing:
        blockers["ARTIFACT_MISSING"] = "有发布产物、格网样点或清单瓦片条目缺失。"

    return {
        "status": "blocked" if blockers else "review_required",
        "atlasSha256": hashlib.sha256(atlas_bytes).hexdigest(),
        "atlasYear": atlas["year"],
        "gridYear": atlas["gridYear"],
        "auditedYear": selected,
        "sources": sources,
        "geography": geography,
        "economy": economy,
        "missingArtifacts": missing,
        "blockers": blockers,
    }


def print_summary(report):
    print(f"图谱审计 {report['status']} · 年度 {report['auditedYear']} · 人口格网年 {report['gridYear']}")
    print(f"atlas.json SHA-256 {report['atlasSha256']}")
    geography = report["geography"]
    print(f"地图区域 {geography['regionCount']} 个 · WDI 映射 {geography['wdiMappings']} 个")
    for name, probe in geography["probes"].items():
        grid = []
        for cell in probe["h3"].values():
            record = cell["record"]
            grid.append("缺档" if record is None else record["region"] or "无区域")
        overview = "缺档" if probe["overview"] is None else ",".join(probe["overview"]) or "无命中"
        detail = ",".join(probe["detail"]) or "无命中"
        print(f"{name} · 轮廓 {detail} · 概览 {overview} · R2/R3/R4 {' / '.join(grid)}")
    economy = report["economy"]
    for year, annual in economy["annual"].items():
        gdp = " / ".join(f"{region}={annual['values'][region]['gdp']}" for region in REGIONS[:4])
        print(f"{year} 年 GDP（{economy['metrics'].get('gdp', {}).get('unit') or '单位未声明'}）· "
              f"{annual['regionsWithGdp']} 个区域有值 · {gdp}")
    for code, reason in report["blockers"].items():
        print(f"[{code}] {reason}")
    if report["missingArtifacts"]:
        print("缺失项 " + "，".join(report["missingArtifacts"]))
    print("发布须另行复核官方图幅、地图审核、使用授权和经济口径。")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=DATA_DIR, help="本地图谱数据目录")
    parser.add_argument("--year", type=int, help="附加核查年份，默认为图谱展示年")
    parser.add_argument("--json", action="store_true", help="输出完整 JSON 结果")
    parser.add_argument("--strict", action="store_true", help="存在自动检测到的阻断项时返回 1")
    args = parser.parse_args(argv)
    try:
        report = audit(args.data_dir, args.year)
    except (OSError, ValueError, KeyError, IndexError, TypeError, AttributeError) as error:
        print(f"无法核查图谱输入 · {error}", file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False))
    else:
        print_summary(report)
    return int(args.strict and bool(report["blockers"]))


if __name__ == "__main__":
    sys.exit(main())
