import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'pipeline/standard_map_intake.py'
sys.path.insert(0, str(ROOT / 'pipeline'))
import standard_map_intake as intake  # noqa: E402


def square(lon, lat, size=0.5):
    return [[[lon - size, lat - size], [lon + size, lat - size],
             [lon + size, lat + size], [lon - size, lat + size], [lon - size, lat - size]]]


def feature(name, coordinates):
    return {'type': 'Feature', 'properties': {'name': name},
            'geometry': {'type': 'Polygon', 'coordinates': coordinates}}


def collection():
    return {
        'type': 'FeatureCollection',
        'features': [
            feature('中华人民共和国', [[[100, 0], [135, 0], [135, 46], [100, 46], [100, 0]]]),
            feature('台湾省', square(120.95, 23.70, 1.2)),
            feature('香港特别行政区', square(114.17, 22.32, 0.5)),
            feature('澳门特别行政区', square(113.53, 22.19, 0.3)),
        ],
    }


class StandardMapIntakeTest(unittest.TestCase):
    def test_accepts_well_formed_candidate_for_manual_review(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'map.geojson'
            report = Path(directory) / 'report.json'
            source.write_text(json.dumps(collection()), encoding='utf-8')
            document = intake.intake(source, 'GS(2024)1234号', 'https://example.org/map', report)
            self.assertEqual(document['status'], 'ready_for_manual_review')
            self.assertEqual(document['blockers'], [])
            self.assertEqual(document['geojsonSha256'], __import__('hashlib').sha256(source.read_bytes()).hexdigest())
            self.assertIn('不构成审图结论', document['notice'])
            self.assertTrue(any(item['check'] == 'probe:黄岩岛' and item['ok'] for item in document['checks']))

    def test_rejects_bad_approval_and_missing_region(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'map.geojson'
            report = Path(directory) / 'report.json'
            document = collection()
            document['features'] = [document['features'][0]]  # China only, no Taiwan/HK/Macao
            source.write_text(json.dumps(document), encoding='utf-8')
            result = intake.intake(source, '2024-1234', 'https://example.org/map', report)
            self.assertEqual(result['status'], 'rejected')
            self.assertTrue(any('审图号' in item for item in result['blockers']))
            self.assertTrue(any('台湾省' in item for item in result['blockers']))
            self.assertTrue(any('香港' in item for item in result['blockers']))

    def test_rejects_projected_or_malformed_coordinates(self):
        document = collection()
        document['features'][0]['geometry']['coordinates'] = [[[1e7, 2e6], [2e7, 2e6], [2e7, 3e6], [1e7, 2e6]]]
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'map.geojson'
            source.write_text(json.dumps(document), encoding='utf-8')
            with self.assertRaises(ValueError):
                intake.intake(source, 'GS(2024)1234号', 'https://example.org/map', Path(directory) / 'r.json')
        with self.assertRaises(ValueError):
            intake.validate({'type': 'Feature'}, 'GS(2024)1号', 'https://example.org')

    def test_cli_writes_report(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'map.geojson'
            report = Path(directory) / 'out' / 'report.json'
            source.write_text(json.dumps(collection()), encoding='utf-8')
            result = subprocess.run([
                sys.executable, str(SCRIPT), '--geojson', str(source),
                '--approval-number', 'GS(2024)1234号', '--source-url', 'https://example.org/map',
                '--report', str(report),
            ], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual(payload['status'], 'ready_for_manual_review')
            self.assertTrue(report.is_file())


if __name__ == '__main__':
    unittest.main()
