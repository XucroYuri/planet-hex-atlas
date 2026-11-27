# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Verify the frozen history inputs and byte-for-byte rebuild the static archive."""

import argparse
import csv
import io
import json
import math
import statistics
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HISTORY = ROOT / "web/data/history"


def verify(input_dir):
    with tempfile.TemporaryDirectory() as temp:
        output = Path(temp)
        subprocess.run([
            sys.executable, str(ROOT / "pipeline/history_data.py"),
            "--input-dir", str(input_dir), "--output-dir", str(output),
        ], check=True)
        for name in ("catalog.json", "provenance.json", "evidence.json", "maddison-sources.json"):
            assert (output / name).read_bytes() == (HISTORY / name).read_bytes(), name
        expected = sorted(path.name for path in (HISTORY / "series").glob("*.json"))
        assert expected == sorted(path.name for path in (output / "series").glob("*.json"))
        for name in expected:
            assert (output / "series" / name).read_bytes() == (HISTORY / "series" / name).read_bytes(), name

    source = (input_dir / "population.csv").read_text(encoding="utf-8-sig")
    records = [
        (int(row["Year"]), int(row["Population"])) for row in csv.DictReader(io.StringIO(source))
        if row["Code"] == "CHN" and int(row["Year"]) >= 1950
    ]
    train = [(year, value) for year, value in records if year <= 2008]
    holdout = [(year, value) for year, value in records if year > 2008]
    fit = statistics.linear_regression([year - 1950 for year, _ in train], [math.log(value) for _, value in train])
    fixed = train[-1][1]
    model_mape = statistics.mean(abs(math.exp(fit.intercept + fit.slope * (year - 1950)) / value - 1) for year, value in holdout)
    baseline_mape = statistics.mean(abs(fixed / value - 1) for _, value in holdout)
    assert math.isclose(model_mape, 0.2111168739175778)
    assert math.isclose(baseline_mape, 0.04442107716102837)
    print(json.dumps({
        "matchedShards": len(expected), "training": len(train), "holdout": len(holdout),
        "modelMAPE": model_mape, "baselineMAPE": baseline_mape,
    }))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, required=True)
    verify(parser.parse_args().input_dir)
