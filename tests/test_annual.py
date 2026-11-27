"""Prove per-year snapshots preserve nulls and exact values from the history panel."""

import json
from pathlib import Path


def main():
    root=Path(__file__).resolve().parents[1]/'web/data'
    panel=json.loads((root/'observations.json').read_text())
    years=json.loads((root/'atlas.json').read_text())['years']
    observed=0
    for index, year in enumerate(years):
        shard=json.loads((root/'annual'/f'{year}.json').read_text())
        assert shard['year']==year
        for country,metrics in panel.items():
            for metric,series in metrics.items():
                if series[index] is None:
                    assert metric not in shard['regions'].get(country,{})
                else:
                    assert shard['regions'][country][metric]==series[index]
                    observed+=1
    print(f'Passed: {observed:,} values and missing cells across {len(years)} years.')

if __name__=='__main__':main()
