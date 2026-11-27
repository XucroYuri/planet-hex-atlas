"""Validate the official population benchmark file parsed from yearbook table 2-1."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test():
    record = json.loads((ROOT / 'web/data/china-population-official.json').read_text())
    years = record['years']
    expected = [str(year) for year in [1949, 1950, 1951, 1955, 1960, 1965, *range(1970, 2024)]]
    assert list(years) == expected, list(years)[:8]
    assert record['url'].startswith('https://www.stats.gov.cn/sj/ndsj/2024/')
    assert '表 2-1' in record['source']
    assert len(record['imageSha256']) == 64
    anchors = {'1949': 54167, '1955': 61465, '1978': 96259, '2009': 133450, '2023': 140967}
    for year, expected_total in anchors.items():
        assert years[year]['total'] == expected_total, (year, years[year]['total'])
    for year, row in years.items():
        assert abs(row['male'] + row['female'] - row['total']) <= 1, year
        assert abs(row['urban'] + row['rural'] - row['total']) <= 1, year
        assert row['malePct'] + row['femalePct'] == 100.0, year
        assert row['urbanPct'] + row['ruralPct'] == 100.0, year
    official = json.loads((ROOT / 'web/data/china-official.json').read_text())
    benchmarks = official['populationBenchmarks']['years']
    assert len(benchmarks) == 60
    assert benchmarks['1978']['total'] == 96259
    print(f'Official population benchmarks verified: {len(years)} years, 1949–2023 selected by table 2-1.')


if __name__ == '__main__':
    test()
