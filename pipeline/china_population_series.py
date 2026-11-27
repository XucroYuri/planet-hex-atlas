"""OCR the NBS 2024 yearbook table 2-1 population series.

Table 2-1 is an image containing selected years: 1949, 1950, 1951, 1955,
1960, 1965 and every year from 1970 to 2023. Two OCR passes (original and 2x
upscaled) are merged; component sums and published anchors are validated before
the JSON is written. macOS Vision is required (same as pipeline/ocr_table.swift).
"""
import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OCR = ROOT / 'pipeline' / 'ocr_table.swift'
OUT = ROOT / 'web' / 'data' / 'china-population-official.json'
URL = 'https://www.stats.gov.cn/sj/ndsj/2024/html/C02-01.jpg'
YEARS = [1949, 1950, 1951, 1955, 1960, 1965, *range(1970, 2024)]
ANCHORS = {1949: 54167, 1955: 61465, 1978: 96259, 2009: 133450, 2023: 140967}
COLUMNS = [(0.141, 'total'), (0.25, 'male'), (0.352, 'malePct'), (0.449, 'female'),
           (0.555, 'femalePct'), (0.648, 'urban'), (0.754, 'urbanPct'),
           (0.848, 'rural'), (0.953, 'ruralPct')]


def observations(image):
    completed = subprocess.run(['swift', str(OCR), str(image)], check=True, capture_output=True, text=True)
    rows = []
    for line in completed.stdout.splitlines():
        parts = line.split('\t')
        if len(parts) < 5:
            continue
        try:
            rows.append((float(parts[1]), float(parts[0]), parts[4]))
        except ValueError:
            continue
    return rows


def parse(image):
    observations_ = observations(image)
    rows = {int(year): [] for year in YEARS}
    for y, x, text in observations_:
        if x < 0.08 and text.isdigit() and len(text) == 4 and int(text) in rows:
            rows[int(text)].append(y)
    parsed = {}
    for year, labels in rows.items():
        if not labels:
            continue
        center = sum(labels) / len(labels)
        tokens = [(x, text) for y, x, text in observations_
                  if abs(y - center) <= 0.005 and text.replace('.', '', 1).replace('-', '', 1).isdigit()]
        if not tokens:
            continue
        record = {}
        for target, name in COLUMNS:
            candidate = min(tokens, key=lambda item: abs(item[0] - target))
            if abs(candidate[0] - target) <= 0.05:
                record[name] = candidate[1]
        if record:
            parsed[year] = record
    return parsed


def build(image):
    observations_ = []
    with tempfile.TemporaryDirectory() as temporary:
        sources = [image]
        for scale in (2, 3):
            upscaled = Path(temporary) / f'upscaled-{scale}.png'
            source = Image.open(image).convert('L')
            source = source.resize((source.width * scale, source.height * scale), Image.Resampling.LANCZOS)
            source = ImageEnhance.Contrast(source).enhance(1.6).filter(ImageFilter.SHARPEN)
            source.save(upscaled)
            sources.append(upscaled)
        for source in sources:
            observations_.extend(observations(source))
    seen = set()
    unique = []
    for y, x, text in observations_:
        key = (round(y, 5), round(x, 4), text)
        if key not in seen:
            seen.add(key)
            unique.append((y, x, text))
    unique.sort(reverse=True)
    clusters = []
    for y, x, text in unique:
        if clusters and abs(clusters[-1][0] - y) < 0.004:
            clusters[-1][1].append((x, text))
        else:
            clusters.append([y, [(x, text)]])
    rows = []
    for _y, items in clusters:
        tokens = [(x, text) for x, text in items
                  if text.replace('.', '', 1).replace('-', '', 1).isdigit()]
        record = {}
        for target, name in COLUMNS:
            if not tokens:
                continue
            candidate = min(tokens, key=lambda item: abs(item[0] - target))
            if abs(candidate[0] - target) <= 0.05:
                record[name] = candidate[1]
        if len(record) >= 7:
            rows.append(record)
    if len(rows) != len(YEARS):
        raise SystemExit(f'expected {len(YEARS)} rows, OCR produced {len(rows)}')
    series = {}
    for year, record in zip(YEARS, rows):
        if 'total' not in record:
            male, female = int(record['male']), int(record['female'])
            urban, rural = int(record['urban']), int(record['rural'])
            if male + female != urban + rural:
                raise SystemExit(f'{year}: component sums disagree ({male + female} vs {urban + rural})')
            record['total'] = str(male + female)
        male, female = int(record['male']), int(record['female'])
        urban, rural = int(record['urban']), int(record['rural'])
        total = int(record.get('total', male + female))
        if abs(male + female - total) > 60:
            raise SystemExit(f'{year}: sex component sum mismatch')
        total = male + female
        if abs(urban + rural - total) > 60:
            raise SystemExit(f'{year}: urban/rural component sum mismatch')
        if urban + rural != total:
            urban_expected = total * float(record['urbanPct']) / 100
            rural_expected = total * float(record['ruralPct']) / 100
            if abs(urban - urban_expected) > abs(rural - rural_expected):
                urban = total - rural
            else:
                rural = total - urban
        if abs(float(record['malePct']) + float(record['femalePct']) - 100) > 0.2:
            raise SystemExit(f'{year}: sex shares do not sum to 100')
        if abs(float(record['urbanPct']) + float(record['ruralPct']) - 100) > 0.2:
            raise SystemExit(f'{year}: urban/rural shares do not sum to 100')
        series[str(year)] = {
            'total': total, 'male': male, 'malePct': float(record['malePct']),
            'female': female, 'femalePct': float(record['femalePct']),
            'urban': urban, 'urbanPct': float(record['urbanPct']),
            'rural': rural, 'ruralPct': float(record['ruralPct']),
        }
    for year, expected in ANCHORS.items():
        actual = series[str(year)]['total']
        if actual != expected:
            raise SystemExit(f'anchor {year}: {actual} != {expected}')
    return {
        'schema': 1,
        'source': '《中国统计年鉴 2024》表 2-1 人口数及构成',
        'url': URL,
        'imageSha256': hashlib.sha256(image.read_bytes()).hexdigest(),
        'note': '官方选年序列：1949、1950、1951、1955、1960、1965 及 1970–2023 每年；2024–2025 年末人口来自年度统计公报。',
        'years': series,
    }

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=Path(tempfile.gettempdir()) / 'orbis-china-population')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    image = args.cache / 'C02-01.jpg'
    if not image.is_file():
        from urllib.request import Request, urlopen
        image.write_bytes(urlopen(Request(URL, headers={'User-Agent': 'PlanetHexAtlas/1.0'}), timeout=60).read())
    record = build(image)
    text = json.dumps(record, ensure_ascii=False, indent=2) + '\n'
    if args.check:
        if not OUT.is_file() or OUT.read_text() != text:
            print('china-population-official.json is stale; rerun pipeline/china_population_series.py', file=sys.stderr)
            return 1
        print(f'Official population benchmarks are current ({len(record["years"])} years).')
        return 0
    OUT.write_text(text)
    print(f'Wrote {OUT.relative_to(ROOT)}: {len(record["years"])} years, image {image.stat().st_size} bytes.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
