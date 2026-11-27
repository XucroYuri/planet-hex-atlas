"""Verify the standard-map handoff package is small, complete and honest."""

import json
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'pipeline'))
import build_submission_package as package  # noqa: E402


def test():
    with tempfile.TemporaryDirectory() as temporary:
        out = Path(temporary) / 'submission.zip'
        manifest = package.build(out)
        assert out.is_file() and out.stat().st_size < 100_000, out.stat().st_size
        with zipfile.ZipFile(out) as archive:
            names = set(archive.namelist())
            for required in ('README.md', 'manifest.json', 'audit.json', 'standard-map-status.json',
                             'inventory.csv', 'docs/china-map-submission/README.md'):
                assert required in names, required
            assert not any(name.startswith('.git') or name.endswith(('.bin', '.webp', '.zip')) for name in names)
            assert archive.read('README.md').decode('utf-8').count('未取得审图号') >= 1
            data = json.loads(archive.read('manifest.json'))
            assert data['status'] == 'blocked'
            assert data['blockers'] == ['MAP_SOURCE', 'LEGACY_GEOMETRY', 'ISLAND_GEOMETRY'], data['blockers']
            assert len(data['files']) >= 10
            inventory = archive.read('inventory.csv').decode('utf-8').splitlines()
            assert inventory[0] == 'path,bytes,sha256'
            assert len(inventory) == 1 + len(data['files'])
            for line in inventory[1:]:
                path, size, digest = line.rsplit(',', 2)
                assert int(size) > 0 and len(digest) == 64, line
        print(f'Submission package verified: {out.stat().st_size} bytes, {len(names)} entries, '
              f'{len(manifest["blockers"])} blockers.')


if __name__ == '__main__':
    test()
