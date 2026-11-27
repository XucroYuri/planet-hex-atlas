"""Build the annual orbital-launch series from the pinned OWID / UNOOSA extract.

uv run pipeline/space_launches.py
"""
import csv
import hashlib
import io
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'web/data/space/launches.json'
SOURCE = {
    'url': 'https://ourworldindata.org/grapher/yearly-number-of-objects-launched-into-outer-space.csv',
    'chart': 'https://ourworldindata.org/grapher/yearly-number-of-objects-launched-into-outer-space',
    'citation': 'United Nations Office for Outer Space Affairs (2026), compiled by Our World in Data.',
    'license': 'CC BY 4.0',
    'sha256': '0b2c20c41368cd53',
}
COLUMN = 'Annual number of objects launched into outer space'


def download(cache):
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / 'launches.csv'
    if not path.exists():
        request = urllib.request.Request(SOURCE['url'], headers={'User-Agent': 'Orbis Atlas data pipeline'})
        with urllib.request.urlopen(request, timeout=60) as response:
            path.write_bytes(response.read())
    return path


def build(cache):
    raw = download(cache).read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if not digest.startswith(SOURCE['sha256']):
        raise ValueError(f'launch source hash changed: {digest}')
    rows = list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
    if list(rows[0].keys()) != ['Entity', 'Code', 'Year', COLUMN]:
        raise ValueError(f'unexpected columns: {rows[0].keys()}')
    world = {}
    countries = {}
    for row in rows:
        code = row['Code']
        year = int(row['Year'])
        value = int(row[COLUMN])
        if not 0 <= value <= 10000:
            raise ValueError(f'implausible launch count: {row}')
        if code == 'OWID_WRL':
            world[year] = value
        elif code:
            entry = countries.setdefault(code, {'name': row['Entity'], 'series': []})
            entry['series'].append([year, value])
    if min(world) != 1957 or max(world) != 2025:
        raise ValueError(f'unexpected world range: {min(world)}–{max(world)}')
    for entry in countries.values():
        entry['series'].sort()
        years = [year for year, _ in entry['series']]
        if len(years) != len(set(years)):
            raise ValueError(f'duplicate year for {entry["name"]}')
    world_series = sorted(world.items())
    for year, value in world_series:
        if year not in (1957, 1958) and value < 0:
            raise ValueError('negative world count')
    country_sum = {year: 0 for year in world}
    for entry in countries.values():
        for year, value in entry['series']:
            country_sum[year] = country_sum.get(year, 0) + value
    diffs = {year: world[year] - country_sum.get(year, 0) for year in world}
    peak_year, peak_value = max(world_series, key=lambda item: item[1])
    document = {
        'schema': 1,
        'source': {**SOURCE, 'sha256': digest},
        'years': [year for year, _ in world_series],
        'world': world_series,
        'countries': countries,
        'totals': {
            'objects': sum(value for _, value in world_series),
            'latest': {'year': world_series[-1][0], 'count': world_series[-1][1]},
            'peak': {'year': peak_year, 'count': peak_value},
            'countrySumDiff': diffs,
        },
        'note': '设施归属按 UNOOSA 登记的处理国或组织统计，不等同于卫星制造国；世界合计与逐国相加的差异保留在 countrySumDiff。',
    }
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(json.dumps(document, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(json.dumps({'years': len(world), 'countries': len(countries), 'objects': document['totals']['objects'],
                      'peak': document['totals']['peak'], 'latest': document['totals']['latest']}, ensure_ascii=False))


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=ROOT / '.cache/space')
    build(parser.parse_args().cache)
