"""Verify the deterministic open-data ZIP bundle."""

import json
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'pipeline'))
import open_data_bundle as bundle  # noqa: E402


def test():
    with tempfile.TemporaryDirectory() as temporary:
        first = Path(temporary) / 'a.zip'
        second = Path(temporary) / 'b.zip'
        manifest = bundle.build(first)
        bundle.build(second)
        assert first.read_bytes() == second.read_bytes(), 'bundle is not deterministic'
        assert first.stat().st_size > 1_000_000
        assert first.stat().st_size < 20_000_000
        counts = manifest['counts']
        assert counts['annualYears'] == 66
        assert counts['historyAreas'] == 275
        assert counts['historyMetrics'] == 13
        assert counts['spaceObjects'] == 24865
        assert counts['marketSymbols'] == 1404
        assert counts['officialGdpYears'] == 48
        assert counts['officialPopulationYears'] == 60
        with zipfile.ZipFile(first) as archive:
            names = set(archive.namelist())
            for required in ('manifest.json', 'ATTRIBUTION.txt', 'source-lock.json', 'annual/1960.json',
                             'annual/2025.json', 'history/catalog.json', 'history/series/WORLD.json',
                             'space/launches.json', 'markets/index.json', 'china-official.json',
                             'china-population-official.json'):
                assert required in names, required
            assert any(name.startswith('markets/quotes-') for name in names)
            assert not any(name.startswith(('h2/', 'h3/', 'h4/', 'downloads/')) for name in names)
            manifest_file = json.loads(archive.read('manifest.json'))
            for entry in manifest_file['files']:
                payload = archive.read(entry['path'])
                assert len(payload) == entry['bytes'], entry['path']
        print(f"Open data bundle verified: {first.stat().st_size} bytes, {len(names)} entries.")


if __name__ == '__main__':
    test()
