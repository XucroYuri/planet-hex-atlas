"""Validate a candidate standard-map geometry before it can replace the basemap.

This tool does not approve a map and never writes production geometry. It checks
that a supplied vector file is well-formed, carries an approval number, names the
required Chinese administrative regions, and places known sample points in the
expected regions. Its report is evidence for the manual review that still has to
happen with the map authority.

uv run pipeline/standard_map_intake.py --geojson map.geojson \
    --approval-number 'GS(2024)1234号' --source-url https://example.org/map --report docs/china-map-intake/report.json
"""
import argparse
import hashlib
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APPROVAL = re.compile(r'^GS[（(]\d{4}[）)]\d{1,6}号$')
REQUIRED_REGIONS = {
    '中国': ['中国', '中华人民共和国', 'china', 'chn'],
    '台湾省': ['台湾', 'taiwan', 'twn'],
    '香港特别行政区': ['香港', 'hong kong', 'hkg'],
    '澳门特别行政区': ['澳门', 'macao', 'macau', 'mac'],
}
PROBES = {
    '北京': (116.40, 39.90, '中国'),
    '台湾本岛': (120.95, 23.70, '台湾省'),
    '香港九龙': (114.17, 22.32, '香港特别行政区'),
    '澳门半岛': (113.533, 22.188, '澳门特别行政区'),
    '黄岩岛': (117.754, 15.151, '中国'),
    '东沙岛': (116.73, 20.70, '中国'),
    '太平岛': (114.36, 10.38, '中国'),
    '曾母暗沙': (112.50, 3.97, '中国'),
    '钓鱼岛': (123.475, 25.745, '中国'),
}
ALLOWED_GEOMETRY = {'Polygon', 'MultiPolygon'}


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def rings(geometry):
    if geometry.get('type') == 'Polygon':
        yield from geometry.get('coordinates') or []
    elif geometry.get('type') == 'MultiPolygon':
        for polygon in geometry.get('coordinates') or []:
            yield from polygon


def point_in_ring(lon, lat, ring):
    inside = False
    if len(ring) < 4:
        return False
    for index in range(len(ring) - 1):
        x1, y1 = ring[index][0], ring[index][1]
        x2, y2 = ring[index + 1][0], ring[index + 1][1]
        if (y1 > lat) != (y2 > lat):
            cross = x1 + (lat - y1) * (x2 - x1) / (y2 - y1)
            if lon < cross:
                inside = not inside
    return inside


def point_in_geometry(lon, lat, geometry):
    pieces = list(rings(geometry))
    if geometry.get('type') == 'Polygon':
        pieces = [pieces] if pieces else []
    else:
        pieces = [list(group) for group in (geometry.get('coordinates') or [])]
    for polygon in pieces:
        if not polygon:
            continue
        outer = point_in_ring(lon, lat, polygon[0])
        holes = any(point_in_ring(lon, lat, hole) for hole in polygon[1:])
        if outer and not holes:
            return True
    return False


def feature_names(properties):
    names = []
    for key, value in (properties or {}).items():
        if isinstance(value, str) and value.strip():
            names.append(value.strip())
    return names


def matches(names, wanted):
    return any(any(token in name.casefold() for token in wanted) for name in names)


def validate(document, approval_number, source_url):
    checks = []
    blockers = []
    if not APPROVAL.match(approval_number or ''):
        blockers.append('审图号格式不符，应为 GS(年份)编号号')
    else:
        checks.append({'check': 'approvalNumber', 'ok': True, 'value': approval_number})
    if not (source_url or '').startswith(('http://', 'https://')):
        blockers.append('来源链接缺失或不是 http(s)')
    if document.get('type') != 'FeatureCollection' or not isinstance(document.get('features'), list):
        raise ValueError('不是 GeoJSON FeatureCollection')
    features = document['features']
    if not features:
        raise ValueError('没有要素')
    for feature in features:
        geometry = feature.get('geometry') or {}
        if geometry.get('type') not in ALLOWED_GEOMETRY:
            raise ValueError(f'不支持的几何类型：{geometry.get("type")}')
        for ring in rings(geometry):
            for point in ring:
                if not (isinstance(point, list) and len(point) >= 2 and
                        all(isinstance(value, (int, float)) and math.isfinite(value) for value in point[:2])):
                    raise ValueError('坐标不是有限数值')
                if not (-180 <= point[0] <= 180 and -90 <= point[1] <= 90):
                    raise ValueError('坐标超出经纬度范围，请先转换为 WGS84 经纬度')
    checks.append({'check': 'geojson', 'ok': True, 'features': len(features)})

    named = [(feature, feature_names(feature.get('properties'))) for feature in features]
    for region, tokens in REQUIRED_REGIONS.items():
        present = any(matches(names, tokens) for _, names in named)
        checks.append({'check': f'region:{region}', 'ok': present})
        if not present:
            blockers.append(f'缺少行政区要素：{region}')

    for probe, (lon, lat, expected) in PROBES.items():
        tokens = REQUIRED_REGIONS[expected]
        hits = [names for feature, names in named
                if point_in_geometry(lon, lat, feature.get('geometry') or {})]
        ok = any(matches(names, tokens) for names in hits)
        checks.append({'check': f'probe:{probe}', 'ok': ok, 'features': [names[:2] for names in hits][:4]})
        if not ok:
            blockers.append(f'样点 {probe} 未落入标注为“{expected}”的要素')
    return checks, blockers


def intake(geojson, approval_number, source_url, report):
    raw = Path(geojson).read_bytes()
    document = json.loads(raw)
    checks, blockers = validate(document, approval_number, source_url)
    report_document = {
        'schema': 1,
        'tool': 'pipeline/standard_map_intake.py',
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'approvalNumber': approval_number,
        'sourceUrl': source_url,
        'geojsonSha256': hashlib.sha256(raw).hexdigest(),
        'checks': checks,
        'blockers': blockers,
        'status': 'ready_for_manual_review' if not blockers else 'rejected',
        'notice': '本报告只验证候选数据格式与样点落位，不构成审图结论，也不得据此宣称符合标准地图要求。',
    }
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(report_document, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'status': report_document['status'], 'blockers': blockers, 'report': str(report)},
                     ensure_ascii=False))
    return report_document


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--geojson', required=True)
    parser.add_argument('--approval-number', required=True)
    parser.add_argument('--source-url', required=True)
    parser.add_argument('--report', type=Path, default=ROOT / 'docs/china-map-intake/report.json')
    args = parser.parse_args()
    try:
        intake(args.geojson, args.approval_number, args.source_url, args.report)
    except (OSError, ValueError) as error:
        raise SystemExit(f'导入核验失败：{error}')
