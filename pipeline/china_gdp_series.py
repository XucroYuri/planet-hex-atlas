"""Build China's official GDP series from the NBS yearbook table 3-1.

The yearbook publishes table 3-1 as an image. On macOS we OCR it with Vision
(pipeline/ocr_table.swift); on other platforms pass a coordinate TSV produced
by any OCR tool with the same columns: x, y, w, h, text.

uv run pipeline/china_gdp_series.py --cache .cache/china
"""
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
YEARBOOK = 'https://www.stats.gov.cn/sj/ndsj/2024/html/C03-01.jpg'
YEARBOOK_PAGE = 'https://www.stats.gov.cn/sj/ndsj/2024/indexch.htm'
# Header x positions (normalised) of table 3-1. Each numeric cell is assigned to
# the header interval that contains its left edge, which survives variable cell widths.
HEADERS = [('year', 0.016), ('gni', 0.068), ('gdp', 0.129), ('primary', 0.182),
           ('secondary', 0.241), ('tertiary', 0.300), ('farming', 0.354), ('industry', 0.427),
           ('construction', 0.481), ('retail', 0.542), ('transport', 0.589), ('hospitality', 0.660),
           ('finance', 0.719), ('realEstate', 0.774), ('other', 0.842),
           ('gniPerCapita', 0.896), ('perCapita', 0.951)]
KEEP = ('gdp', 'primary', 'secondary', 'tertiary')
ANCHORS = {1978: 3678.7, 1990: 18872.9, 2000: 100280.1, 2010: 412119.3,
           2020: 1013567.0, 2022: 1204724.0, 2023: 1260582.1}
# Later revisions supersede the yearbook for their year.
ANNOUNCEMENTS = {
    2023: dict(gdp=1294272, primary=89169, secondary=475936, tertiary=729167,
               revision='第五次全国经济普查后修订数', published='2024-12-27',
               url='https://www.stats.gov.cn/sj/zxfb/202412/t20241227_1957915.html'),
    2024: dict(gdp=1348066, primary=91636, secondary=490305, tertiary=766125, manufacturing=334881,
               realGrowthPercent=5.0, revision='最终核实', published='2025-12-26',
               population=140828, urban=94350, rural=46478,
               url='https://www.stats.gov.cn/sj/zxfb/202512/t20251226_1962144.html'),
    2025: dict(gdp=1401879, primary=93347, secondary=499653, tertiary=808879,
               realGrowthPercent=5.0, revision='初步核算', published='2026-02-28',
               population=140489, urban=95380, rural=45109,
               perCapitaGdp=99665, gni=1393700, laborProductivity=184413,
               grainOutput=71488, merchandiseTrade=454685, retailSales=501202,
               urbanDisposableIncome=56502, ruralDisposableIncome=24456,
               birthRate=5.63, deathRate=8.04, naturalGrowthRate=-2.41, surveyedUnemployment=5.2,
               eastGdp=730876, eastGrowth=5.0, centralGdp=299108, centralGrowth=5.2,
               westGdp=298750, westGrowth=5.1, northeastGdp=65035, northeastGrowth=4.1,
               rdExpenditure=39262, rdIntensity=2.8, disposableIncome=43377, urbanizationRate=67.89,
               url='https://www.stats.gov.cn/sj/zxfb/202602/t20260228_1962662.html'),
}


def download(cache):
    cache.mkdir(parents=True, exist_ok=True)
    target = cache / 'C03-01.jpg'
    if not target.exists():
        request = urllib.request.Request(YEARBOOK, headers={'User-Agent': 'Orbis Atlas data pipeline'})
        with urllib.request.urlopen(request, timeout=60) as response:
            target.write_bytes(response.read())
    return target


def ocr(image):
    with tempfile.NamedTemporaryFile('w', suffix='.tsv', delete=False) as handle:
        output = Path(handle.name)
    subprocess.run(['swift', str(ROOT / 'pipeline' / 'ocr_table.swift'), str(image)],
                   check=True, stdout=output.open('w'))
    try:
        return output.read_text()
    finally:
        output.unlink(missing_ok=True)


def parse(tsv):
    rows = []
    for line in tsv.splitlines():
        parts = line.split('\t')
        if len(parts) != 5:
            continue
        x, y, w, h, text = parts
        try:
            rows.append((float(x), float(y), text.strip()))
        except ValueError:
            continue
    groups = []
    for row in sorted(rows, key=lambda r: (-r[1], r[0])):
        if groups and abs(groups[-1][0] - row[1]) < 0.0045:
            groups[-1][1].append(row)
        else:
            groups.append([row[1], [row]])
    result = {}
    for _, items in groups:
        cells = {}
        for x, _, text in sorted(items, key=lambda r: r[0]):
            # Pick the header whose interval contains x (midpoints between header x values).
            best = 0
            for index, (_, hx) in enumerate(HEADERS[:-1]):
                boundary = (hx + HEADERS[index + 1][1]) / 2
                if x >= boundary:
                    best = index + 1
            cells.setdefault(HEADERS[best][0], []).append(text)
        year = cells.get('year', [''])[0]
        if not re.fullmatch(r'\d{4}', year):
            continue
        year = int(year)
        if not 1978 <= year <= 2023:
            continue
        values = {}
        for key in KEEP:
            if key not in cells:
                continue
            raw = cells[key][0].replace(',', '').replace(' ', '')
            match = re.match(r'-?\d+(?:\.\d+)?', raw)
            if match:
                values[key] = float(match.group(0))
        result[year] = values
    return result


def validate(series):
    assert len(series) == 46 and min(series) == 1978 and max(series) == 2023, len(series)
    for year, expected in ANCHORS.items():
        assert abs(series[year]['gdp'] - expected) < 0.15, (year, series[year]['gdp'], expected)
    previous = None
    for year in sorted(series):
        row = series[year]
        parts = row['primary'] + row['secondary'] + row['tertiary']
        assert abs(parts - row['gdp']) / row['gdp'] < 0.004, (year, parts, row['gdp'])
        assert row['gdp'] > 0
        if previous is not None:
            assert row['gdp'] > previous, f'GDP must grow in current prices: {year}'
        previous = row['gdp']
    for year in ANNOUNCEMENTS:
        if year in series:
            assert ANNOUNCEMENTS[year]['gdp'] > series[year]['gdp'] or year == 2025
    return True


def build(cache):
    image = download(cache)
    digest = hashlib.sha256(image.read_bytes()).hexdigest()
    series = parse(ocr(image))
    validate(series)
    yearly = {}
    for year, row in sorted(series.items()):
        yearly[str(year)] = {
            **{key: row[key] for key in ('gdp', 'primary', 'secondary', 'tertiary') if key in row},
            'revision': '《中国统计年鉴 2024》当年价',
            'published': '2024-09-01',
            'url': YEARBOOK,
        }
    for year, values in ANNOUNCEMENTS.items():
        yearly[str(year)] = values
    document = {
        'schema': 3,
        'authority': '国家统计局',
        'authorityEn': 'National Bureau of Statistics of China',
        'unit': '亿元',
        'perCapitaUnit': '元',
        'priceBasis': '当年价格',
        'scope': '全国年度 GDP，未包括香港、澳门特别行政区和台湾省的地区生产总值。',
        'populationNote': '年末全国人口仅在 2024、2025 年统计公报中直接取得；更早年份待可机器读取的官方来源。',
        'scopeEn': 'National annual GDP. The series excludes the regional GDP of Hong Kong SAR, Macao SAR and Taiwan Province.',
        'source': {
            'yearbook': {'edition': 2024, 'table': '3-1 国内生产总值', 'url': YEARBOOK, 'page': YEARBOOK_PAGE,
                         'sha256': digest, 'method': 'macOS Vision OCR; reproduced by pipeline/china_gdp_series.py'},
            'announcements': {str(year): {'url': values['url'], 'published': values['published'],
                                          'revision': values['revision']} for year, values in ANNOUNCEMENTS.items()},
        },
        'notes': [
            '1978–2022 来自《中国统计年鉴 2024》表 3-1（当年价）。',
            '2023 采用第五次全国经济普查后修订数；2024 采用最终核实；2025 采用初步核算。后续修订可能改变当年值。',
            '2024、2025 年附年度统计公报的年末全国人口（万人）及城镇/乡村常住人口；更早年份的官方人口长序列待可机器读取来源。',
            '2025 年公报另列全年人均国内生产总值 99,665 元、国民总收入 1,393,700 亿元、全员劳动生产率 184,413 元/人，以及粮食产量、货物进出口、社会消费品零售、研发经费、居民人均可支配收入与常住人口城镇化率。',
            '三次产业不等于 GDP 的部分为统计修约误差；本文件未作机械调整。',
        ],
        'series': yearly,
    }
    target = ROOT / 'web/data/china-official.json'
    target.write_text(json.dumps(document, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'{len(yearly)} 年官方 GDP 序列，{target}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=ROOT / '.cache/china')
    build(parser.parse_args().cache)
