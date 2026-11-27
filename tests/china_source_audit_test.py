import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pipeline import china_source_audit as audit


def write_json(root, name, data):
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def polygon_at(name):
    (lon, lat), *_ = audit.PROBES[name]
    west, east = lon - 0.002, lon + 0.002
    south, north = lat - 0.002, lat + 0.002
    return [[[west, south], [east, south], [east, north], [west, north], [west, south]]]


class ChinaSourceAuditTest(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        self.regions = [
            {"id": "CHN", "zh": "中国", "wdi": "CHN"},
            {"id": "HKG", "zh": "香港", "wdi": "HKG"},
            {"id": "MAC", "zh": "澳门", "wdi": "MAC"},
            {"id": "SCR", "zh": "黄岩岛", "wdi": None},
            {"id": "TWN", "zh": "台湾", "wdi": None},
        ]
        tiles = {}
        test_regions = {"北京": 1, "台湾本岛": 5, "香港九龙": 2}
        for name, (_, world, r3, r4) in audit.PROBES.items():
            for level, (tile, cell) in zip(("2", "3", "4"), (("world", world), r3, r4), strict=True):
                region = test_regions.get(name, 0)
                if name in ("香港九龙", "澳门半岛西侧") and level == "2":
                    region = 1
                tiles.setdefault((level, tile), {})[cell] = region
        tile_index = {}
        for (level, tile), rows in tiles.items():
            path = self.root / f"h{level}/{tile}.bin"
            path.parent.mkdir(exist_ok=True)
            path.write_bytes(audit.HEADER.pack(b"HXA1", len(rows)) + b"".join(
                audit.RECORD.pack(int(cell, 16), 0, index, 0, 255 if index else 0, 0, 0)
                for cell, index in rows.items()
            ))
            tile_index.setdefault(level, []).append(tile)

        self.sources = {
            "atlas-country.zip": "https://naturalearth.s3.amazonaws.com/ne_10m_admin_0_countries.zip",
            "regions.json": "https://api.worldbank.org/v2/country",
            "wdi-gdp.zip": "https://api.worldbank.org/v2/en/indicator/NY.GDP.MKTP.CD",
        }
        self.atlas = {
            "countries": self.regions, "years": [2023, 2024], "year": 2023, "gridYear": 2020,
            "sources": self.sources, "tiles": tile_index,
            "metrics": [{"id": "gdp", "code": "NY.GDP.MKTP.CD", "unit": "美元", "updated": "2026-11-11"}],
        }
        self.write_sources()
        outlines = [[polygon_at(name)] for name in ("北京", "香港九龙", "澳门半岛西侧", "黄岩岛", "台湾本岛")]
        write_json(self.root, "outlines.json", outlines)
        write_json(self.root, "overview.json", {"outlines": [outlines[0], outlines[1], [], [], outlines[4]]})
        write_json(self.root, "observations.json", {
            "CHN": {"gdp": [100, 120]}, "HKG": {"gdp": [30, 35]}, "MAC": {"gdp": [0, None]},
        })
        write_json(self.root, "annual/2023.json", {
            "year": 2023, "regions": {"CHN": {"gdp": 100}, "HKG": {"gdp": 30}, "MAC": {"gdp": 0}},
        })
        write_json(self.root, "annual/2024.json", {
            "year": 2024, "regions": {"CHN": {"gdp": 120}, "HKG": {"gdp": 35}},
        })

    def write_sources(self):
        write_json(self.root, "atlas.json", self.atlas)
        write_json(self.root, "source-lock.json", {
            name: {"url": url, "sha256": "a" * 64} for name, url in self.sources.items()
        })

    def run_cli(self, *options):
        return subprocess.run(
            [sys.executable, "-B", audit.__file__, "--data-dir", str(self.root), *options],
            capture_output=True, text=True, check=False,
        )

    def test_reads_geometry_grid_and_economic_coverage(self):
        report = audit.audit(self.root)
        geo = report["geography"]
        economy = report["economy"]
        self.assertEqual(report["status"], "blocked")
        self.assertEqual(geo["wdiMappings"], 3)
        self.assertEqual(geo["regions"]["TWN"]["packedIndex"], 5)
        self.assertEqual(geo["probes"]["台湾本岛"]["detail"], ["TWN"])
        self.assertEqual(geo["probes"]["澳门半岛西侧"]["overview"], [])
        self.assertEqual(geo["probes"]["香港九龙"]["h3"]["2"]["record"]["region"], "CHN")
        self.assertEqual(geo["probes"]["香港九龙"]["h3"]["4"]["record"]["region"], "HKG")
        self.assertEqual(economy["annual"][2023]["values"]["MAC"]["gdp"], 0)
        self.assertEqual(economy["annual"][2023]["regionsWithGdp"], 3)
        self.assertEqual(economy["annual"][2024]["regionsWithGdp"], 2)
        self.assertEqual(economy["coverage"]["TWN"]["gdp"], {"first": None, "last": None, "count": 0})
        self.assertEqual(economy["nbsReference"]["years"][2024]["gdp"], 1348066)
        self.assertEqual(economy["annualDifferences"], [])
        self.assertEqual(set(report["blockers"]), {
            "MAP_SOURCE", "ADMIN_HIERARCHY", "ISLAND_GEOMETRY", "WDI_GDP_BASIS", "TAIWAN_GDP_MISSING",
        })

    def test_labels_and_source_links_cannot_clear_reused_geometry(self):
        detail_digest = hashlib.sha256((self.root / "outlines.json").read_bytes()).hexdigest()
        for row in self.regions:
            if row["id"] in audit.ADMIN_LEVELS:
                row.update(sovereignId="CHN", parentId="CHN", adminLevel=audit.ADMIN_LEVELS[row["id"]])
        self.regions[-1]["zh"] = "台湾省"
        self.sources["atlas-country.zip"] = "https://bzdt.ch.mnr.gov.cn/"
        self.write_sources()
        with patch.object(audit, "AUDITED_DETAIL_SHA256", detail_digest):
            report = audit.audit(self.root)
        self.assertNotIn("MAP_SOURCE", report["blockers"])
        self.assertIn("LEGACY_GEOMETRY", report["blockers"])
        self.assertEqual(report["geography"]["probes"]["台湾本岛"]["detail"], ["TWN"])

    def test_tracks_missing_generated_artifacts_separately_from_nulls(self):
        for path in ("overview.json", "annual/2024.json", "h4/5-15.bin"):
            (self.root / path).unlink()
        report = audit.audit(self.root)
        self.assertEqual(set(report["missingArtifacts"]), {"overview.json", "annual/2024.json", "h4/5-15.bin"})
        self.assertIn("ARTIFACT_MISSING", report["blockers"])
        self.assertIsNone(report["geography"]["probes"]["台湾本岛"]["h3"]["4"]["record"])
        self.assertIsNone(report["geography"]["probes"]["黄岩岛"]["h3"]["4"]["record"]["region"])
        self.assertFalse(report["economy"]["annual"][2024]["annualShardPresent"])
        self.assertEqual(report["economy"]["annual"][2024]["values"]["CHN"]["gdp"], 120)

    def test_detects_annual_shard_and_official_reference_drift(self):
        write_json(self.root, "annual/2023.json", {
            "year": 2023, "regions": {"CHN": {"gdp": 100}, "HKG": {"gdp": 31}, "MAC": {"gdp": 0}},
        })
        series = {str(year): {"gdp": 100, "primary": 10, "secondary": 40, "tertiary": 50}
                  for year in range(1978, 2026)}
        series["2024"] = {"gdp": 1348000, "primary": 91636, "secondary": 490305, "tertiary": 766125}
        write_json(self.root, "china-official.json", {
            "schema": 3, "authority": "国家统计局", "unit": "亿元", "priceBasis": "当年价格",
            "scope": "全国年度 GDP，未包括香港、澳门特别行政区和台湾省的地区生产总值。",
            "source": {}, "series": series,
        })
        report = audit.audit(self.root, year=2024)
        self.assertEqual(report["auditedYear"], 2024)
        self.assertEqual(report["economy"]["annualDifferences"], [
            {"year": 2023, "region": "HKG", "metric": "gdp", "annual": 31, "series": 30},
        ])
        self.assertIn("ANNUAL_DRIFT", report["blockers"])
        self.assertIn("NBS_REFERENCE_DRIFT", report["blockers"])

    def test_cli_strict_blocks_without_changing_input_files(self):
        before = {path: path.read_bytes() for path in self.root.rglob("*") if path.is_file()}
        normal = self.run_cli("--json")
        strict = self.run_cli("--json", "--strict")
        self.assertEqual(normal.returncode, 0, normal.stderr)
        self.assertEqual(strict.returncode, 1, strict.stderr)
        self.assertEqual(normal.stdout, strict.stdout)
        self.assertEqual(json.loads(strict.stdout)["status"], "blocked")
        after = {path: path.read_bytes() for path in self.root.rglob("*") if path.is_file()}
        self.assertEqual(before, after)

    def test_cli_rejects_malformed_h3_tile(self):
        (self.root / "h2/world.bin").write_bytes(audit.HEADER.pack(b"HXA1", 1))
        result = self.run_cli("--json", "--strict")
        self.assertEqual(result.returncode, 2)
        self.assertIn("HXA1", result.stderr)
        self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    unittest.main()
