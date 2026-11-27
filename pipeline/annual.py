"""Pack a separate small observation file per year for the map's fast path."""

import json
from pathlib import Path


def pack_annual(output: Path, observations: dict, years: list[int]):
    folder = output / 'annual'
    folder.mkdir(exist_ok=True)
    for index, year in enumerate(years):
        rows = {}
        for region, metrics in observations.items():
            values = {metric: series[index] for metric, series in metrics.items() if series[index] is not None}
            if values:
                rows[region] = values
        archive = {'year': year, 'regions': rows}
        (folder/f'{year}.json').write_text(json.dumps(archive, separators=(',', ':'), allow_nan=False)+'\n')


if __name__ == '__main__':
    output = Path(__file__).resolve().parents[1]/'web'/'data'
    pack_annual(output, json.loads((output/'observations.json').read_text()), json.loads((output/'atlas.json').read_text())['years'])
