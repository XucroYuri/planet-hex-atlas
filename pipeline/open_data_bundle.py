"""Build the single-file open-data bundle served at /data/downloads/orbis-open-data.zip.

Includes every JSON/CSV/TXT/MD data file except binary tiles, relief textures and
the bundle itself. The ZIP is deterministic (fixed timestamps) and contains a
manifest with row/area counts and per-file SHA-256 checksums.
"""
import argparse
import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'web' / 'data'
EXCLUDED_DIRS = {'h2', 'h3', 'h4', 'downloads', '__pycache__'}
SUFFIXES = {'.json', '.csv', '.txt', '.md'}
STAMP = (1980, 1, 1, 0, 0, 0)


def collect():
    files = []
    for path in sorted(DATA.rglob('*')):
        if not path.is_file() or path.suffix.lower() not in SUFFIXES:
            continue
        relative = path.relative_to(DATA)
        if any(part in EXCLUDED_DIRS for part in relative.parts):
            continue
        files.append(path)
    return files


def build(out):
    files = collect()
    entries = []
    for path in files:
        payload = path.read_bytes()
        entries.append({'path': path.relative_to(DATA).as_posix(), 'bytes': len(payload),
                        'sha256': hashlib.sha256(payload).hexdigest()})
    atlas = json.loads((DATA / 'atlas.json').read_text())
    launches = json.loads((DATA / 'space' / 'launches.json').read_text())
    market = json.loads((DATA / 'markets' / 'index.json').read_text())
    history = json.loads((DATA / 'history' / 'catalog.json').read_text())
    official = json.loads((DATA / 'china-official.json').read_text())
    annual_years = sorted(int(path.stem) for path in (DATA / 'annual').glob('*.json'))
    manifest = {
        'schema': 1,
        'license': 'Code MIT; data per source licenses, see ATTRIBUTION.txt',
        'files': entries,
        'counts': {
            'annualYears': len(annual_years), 'annualFirst': annual_years[0], 'annualLast': annual_years[-1],
            'countries': len(atlas['countries']), 'metrics': len(atlas['metrics']), 'h3R4Cells': atlas['counts']['cells'],
            'historyAreas': len(history['areas']), 'historyMetrics': len(history['totals']),
            'spaceObjects': launches['totals']['objects'], 'spaceYears': len(launches['years']),
            'marketSymbols': len(market['symbols']), 'marketRows': market['rows'],
            'officialGdpYears': len(official['series']),
            'officialPopulationYears': len(official.get('populationBenchmarks', {}).get('years', {})),
        },
    }
    manifest_text = json.dumps(manifest, ensure_ascii=False, separators=(',', ':')) + '\n'
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        def add(name, payload):
            info = zipfile.ZipInfo(name, date_time=STAMP)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, payload)
        add('manifest.json', manifest_text.encode())
        for path in files:
            add(path.relative_to(DATA).as_posix(), path.read_bytes())
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=DATA / 'downloads' / 'orbis-open-data.zip')
    args = parser.parse_args()
    out = args.out if args.out.is_absolute() else ROOT / args.out
    manifest = build(out)
    print(f'Wrote {out.relative_to(ROOT)}: {out.stat().st_size} bytes, {len(manifest["files"])} files, '
          f'{manifest["counts"]["annualYears"]} annual years, {manifest["counts"]["historyAreas"]} history areas.')


if __name__ == '__main__':
    main()
