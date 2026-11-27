# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Build the history shards from pinned public inputs.

uv run pipeline/history_data.py --input-dir /tmp/earthciv-work.XfvPdf/history-input
"""

import argparse
import csv
import hashlib
import io
import json
import math
import os
import tempfile
import urllib.request
from collections import defaultdict
from decimal import Decimal
from pathlib import Path
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "web/data/history"
ATLAS = ROOT / "web/data/atlas.json"
REGIONS = {
    "WORLD": ("001", "OWID_WRL"),
    "AFRICA": ("002", "OWID_AFR"),
    "ASIA": ("142", "OWID_ASI"),
    "EUROPE": ("150", "OWID_EUR"),
    "NORTH_AMERICA": ("003", "OWID_NAM"),
    "SOUTH_AMERICA": ("005", "OWID_SAM"),
    "OCEANIA": ("009", "OWID_OCE"),
}


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n"
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix="._history-", delete=False) as temporary:
        temporary.write(text.encode("utf-8"))
    os.chmod(temporary.name, 0o644)
    os.replace(temporary.name, path)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def get_inputs(input_dir, downloads, fetch):
    manifest_path = input_dir / "manifest.json"
    manifest = (
        {entry["file"]: entry for entry in json.loads(manifest_path.read_bytes())}
        if manifest_path.is_file()
        else {}
    )
    results = {}
    for filename, expected in downloads.items():
        candidates = (input_dir / filename, input_dir.parent / filename)
        source = next((path for path in candidates if path.is_file()), None)
        if filename in manifest:
            for key in ("url", "sha256"):
                if manifest[filename][key] != expected[key]:
                    raise ValueError(f"Prefetch manifest disagrees with the lock for {filename}: {key}")
        if source:
            raw = source.read_bytes()
        elif fetch:
            request = urllib.request.Request(expected["url"], headers={"User-Agent": "PlanetHexAtlas/1.0"})
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = response.read()
        else:
            raise FileNotFoundError(f"{filename} in {input_dir} or {input_dir.parent}")
        if digest(raw) != expected["sha256"]:
            raise ValueError(f"SHA-256 mismatch for {filename}: {digest(raw)}")
        if source is None:
            input_dir.mkdir(parents=True, exist_ok=True)
            (input_dir / filename).write_bytes(raw)
        results[filename] = raw
    return results


def csv_rows(data):
    return csv.DictReader(io.StringIO(data.decode("utf-8-sig"), newline=""))


def add_point(shards, area, metric, year, value):
    if not math.isfinite(value) or value < 0:
        raise ValueError(f"Invalid {metric} value for {area} at {year}")
    points = shards[area].setdefault(metric, {})
    if year in points:
        raise ValueError(f"Duplicate {metric} point for {area} at {year}")
    points[year] = value


def add_grapher(shards, raw, column, areas, metric):
    reader = csv_rows(raw)
    if reader.fieldnames != ["Entity", "Code", "Year", column]:
        raise ValueError(f"Unexpected Grapher columns for {metric}: {reader.fieldnames}")
    for row in reader:
        area = areas.get(row["Code"])
        if not area or not row[column]:
            continue
        year = int(row["Year"])
        if metric in ("density", "urbanShare") and year > 2023:
            continue
        if metric == "population":
            if year > 2023:
                raise ValueError("Population projections must stay outside the historical series")
            value = int(row[column])
        else:
            value = float(row[column])
        if metric == "lifeExpectancy" and not 0 < value <= 120:
            raise ValueError(f"Life expectancy outside 0–120 years for {area} at {year}")
        if metric == "literacy" and not 0 <= value <= 100:
            raise ValueError(f"Literacy outside 0–100% for {area} at {year}")
        if metric == "density" and not 0 <= value <= 1_000_000:
            raise ValueError(f"Density outside 0–1,000,000 for {area} at {year}")
        if metric == "worldGdp" and not 0 < value < 1e17:
            raise ValueError(f"World GDP outside plausible range for {area} at {year}")
        if metric == "urbanShare" and not 0 <= value <= 100:
            raise ValueError(f"Urban share outside 0–100% for {area} at {year}")
        add_point(shards, area, metric, year, value)


def add_wdi(shards, raw, areas):
    with ZipFile(io.BytesIO(raw)) as archive:
        filename, = (name for name in archive.namelist() if name.startswith("API_AG.LND.ARBL.ZS_"))
        lines = archive.read(filename).decode("utf-8-sig").splitlines()
    header = next(index for index, line in enumerate(lines) if line.startswith('"Country Name"'))
    reader = csv.DictReader(lines[header:])
    years = [name for name in reader.fieldnames if name and name.isdigit()]
    for row in reader:
        area = areas.get(row["Country Code"])
        if not area:
            continue
        if row["Indicator Code"] != "AG.LND.ARBL.ZS":
            raise ValueError("Unexpected WDI indicator")
        for year in years:
            if row[year]:
                value = float(row[year])
                if value > 100:
                    raise ValueError(f"Arable share above 100 for {area} at {year}")
                add_point(shards, area, "arable", int(year), value)


def build(input_dir, output_dir, fetch):
    sources = json.loads((DATA / "sources.json").read_bytes())
    inputs = get_inputs(input_dir, sources["downloads"], fetch)
    atlas = json.loads(ATLAS.read_bytes())["countries"]
    countries = {country["id"]: country for country in atlas}
    areas = {
        key: {"iso2": code, "group": key}
        for key, (code, _) in REGIONS.items()
    }
    for region, country in countries.items():
        areas[region] = {
            "iso2": country["iso2"], "group": country["continent"].replace(" ", "_").upper(),
            "zh": country["zh"], "en": country["name"], "mapId": region,
        }

    grapher_codes = {code: region for region, (_, code) in REGIONS.items()} | {key: key for key in countries}
    if "XKX" in countries:
        grapher_codes["OWID_KOS"] = "XKX"
    shards = defaultdict(dict)
    add_grapher(shards, inputs["population.csv"], "Population", grapher_codes, "population")
    gdp_file = "gdp-per-capita-maddison-project-database.csv"
    add_grapher(shards, inputs[gdp_file], "GDP per capita", grapher_codes, "gdp")
    add_grapher(shards, inputs["life-expectancy.csv"], "Life expectancy", grapher_codes, "lifeExpectancy")
    add_grapher(shards, inputs["literacy-rate.csv"], "Literacy rate among adults", grapher_codes, "literacy")
    add_grapher(shards, inputs["population-density.csv"], "Population density", grapher_codes, "density")
    add_grapher(shards, inputs["global-gdp-over-the-long-run.csv"], "GDP", grapher_codes, "worldGdp")
    add_grapher(shards, inputs["share-of-population-urban.csv"], "Urban", grapher_codes, "urbanShare")
    wdi_codes = {key: key for key in countries} | {"WLD": "WORLD"}
    add_wdi(shards, inputs["wdi-cropland.zip"], wdi_codes)

    population_file = ROOT / "web/data/china-population-official.json"
    official_file = ROOT / "web/data/china-official.json"
    if population_file.is_file() and official_file.is_file():
        benchmark = json.loads(population_file.read_text())
        for year, row in benchmark["years"].items():
            add_point(shards, "CHN", "officialPopulation", int(year), row["total"])
        official = json.loads(official_file.read_text())
        for year, row in official["series"].items():
            if row.get("gdp") is not None:
                add_point(shards, "CHN", "officialGdp", int(year), row["gdp"])
        for year in ("2024", "2025"):
            value = official["series"].get(year, {}).get("population")
            if value is not None:
                add_point(shards, "CHN", "officialPopulation", int(year), value)

    crop_path = DATA / "hyde-land-use.csv"
    crop_raw = crop_path.read_bytes().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
    blob = hashlib.sha1(f"blob {len(crop_raw)}\0".encode() + crop_raw).hexdigest()
    expected_blob = "2025f8b28c90f072ab80388073a40a5db6d26de1"
    if blob != expected_blob:
        raise ValueError(f"HYDE source Git blob mismatch: {blob}")
    for row in csv_rows(crop_raw):
        if row["indicator"] in ("cropland", "pasture"):
            add_point(shards, "WORLD", row["indicator"], int(row["year"]), float(row["area_km2"]))

    crop_regions_raw = (DATA / "hyde-32-table2.csv").read_bytes()
    for row in csv_rows(crop_regions_raw):
        region = row.pop("region")
        if not region.startswith("HYDE_") or region in areas:
            raise ValueError(f"Invalid HYDE Table 2 region: {region}")
        areas[region] = {"label": region, "group": "HYDE"}
        for year, value in row.items():
            add_point(shards, region, "cropland", int(year), int(Decimal(value) * 10_000))

    census = (DATA / "census-counts.json").read_bytes()
    for region, data in json.loads(census).items():
        for year, value in data:
            add_point(shards, region, "census", year, value)

    evidence = (DATA / "evidence.json").read_bytes()
    sites = json.loads(evidence)
    for site in sites:
        if site["region"] not in countries or not 0 < site["age"][0] <= site["age"][1]:
            raise ValueError(f"Invalid evidence point: {site['id']}")
    maddison_raw = (DATA / "maddison-sources.json").read_bytes()
    maddison = json.loads(maddison_raw)

    totals = defaultdict(lambda: {"rows": 0, "areas": 0})
    for area, metrics in sorted(shards.items()):
        packed = {metric: sorted(points.items()) for metric, points in sorted(metrics.items())}
        areas[area]["coverage"] = {}
        for metric, points in packed.items():
            areas[area]["coverage"][metric] = [points[0][0], points[-1][0], len(points)]
            totals[metric]["rows"] += len(points)
            totals[metric]["areas"] += 1
        write_json(output_dir / "series" / f"{area}.json", packed)

    local_inputs = {
        "hyde-land-use.csv": {
            "url": "https://datahub.io/climate-and-environment/hyde-history-database-of-the-global-environment/_r/-/data/land-use.csv",
            "gitBlobSha1": blob, "rawSha256": digest(crop_raw),
        },
        "census-counts.json": {"extractSha256": digest(census), "url": sources["sources"]["census"]["url"]},
        "evidence.json": {"curationSha256": digest(evidence)},
        "hyde-32-table2.csv": {
            "extractSha256": digest(crop_regions_raw), "url": sources["sources"]["croplandRegional"]["url"],
        },
        "maddison-sources.json": {
            "url": maddison["url"], "rawSha256": maddison["rawSha256"],
            "gitBlobSha1": maddison["gitBlobSha1"], "extractSha256": digest(maddison_raw),
        },
    }
    if output_dir.resolve() != DATA:
        output_dir.mkdir(parents=True, exist_ok=True)
        for name, raw in [("evidence.json", evidence), ("maddison-sources.json", maddison_raw)]:
            (output_dir / name).write_bytes(raw)
    if population_file.is_file() and official_file.is_file():
        local_inputs["china-population-official.json"] = {
            "url": benchmark["url"], "sha256": digest(population_file.read_bytes()),
        }
        local_inputs["china-official.json"] = {
            "url": official["source"]["yearbook"]["url"], "sha256": digest(official_file.read_bytes()),
        }
    write_json(output_dir / "catalog.json", {"schema": 1, "areas": areas, "totals": totals})
    write_json(output_dir / "provenance.json", {**sources, "localInputs": local_inputs})
    print(json.dumps({"areasWithSeries": len(shards), "evidence": len(sites), "metrics": totals}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=DATA)
    parser.add_argument("--fetch", action="store_true", help="Download absent locked files after checking local inputs.")
    args = parser.parse_args()
    build(args.input_dir, args.output_dir, args.fetch)


if __name__ == "__main__":
    main()
