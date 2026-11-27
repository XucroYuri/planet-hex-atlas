"""Verify physical coverage, joins, annual data and provenance before publication."""

import json
import math
import struct
from pathlib import Path

import h3.api.basic_int as h3

ROOT = Path(__file__).resolve().parents[1] / 'web' / 'data'
RECORD = struct.Struct('<QhHBBfH')


def read(name):
    return json.loads((ROOT / name).read_text())


def validate():
    atlas = read('atlas.json')
    countries = atlas['countries']
    keys = {c['id'] for c in countries}
    assert len(keys) == len(countries) == atlas['counts']['regions']
    wdi = [c['wdi'] for c in countries if c['wdi']]
    assert len(wdi) == len(set(wdi)), 'A national total was assigned to more than one region'
    data = read('observations.json')
    assert set(data) == {c['id'] for c in countries if c['wdi']} | {'WLD'}
    metric_ids = {m['id'] for m in atlas['metrics']}
    assert len(metric_ids) == atlas['counts']['indicators']
    for series_by_metric in data.values():
        for metric, values in series_by_metric.items():
            assert metric in metric_ids and len(values) == len(atlas['years'])
            assert all(v is None or math.isfinite(v) for v in values)
    assert 'ATA' not in data and data['WLD']['pop'][2023-atlas['years'][0]] > 8_000_000_000
    expected = atlas['counts']['gridPopulation']
    for level, tiles in atlas['tiles'].items():
        level = int(level)
        seen = set()
        total = 0.
        for name in tiles:
            payload = (ROOT / f'h{level}' / f'{name}.bin').read_bytes()
            magic, count = struct.unpack_from('<4sI', payload)
            assert magic == b'HXA1' and len(payload) == 8 + count * RECORD.size
            for cell, z, region, biome, land, people, reserved in RECORD.iter_unpack(payload[8:]):
                assert cell not in seen and h3.get_resolution(cell) == level
                assert region <= len(countries) and biome < len(atlas['biomes'])
                assert 0 <= land <= 255 and math.isfinite(people) and people >= 0 and reserved == 0
                assert -12000 < z < 9000
                if level > 2:
                    lat, lon = h3.cell_to_latlng(cell)
                    assert name == f'{min(8,int((lat+90)//20))}-{int(((lon+180)%360)//20)}'
                seen.add(cell)
                total += people
        assert len(seen) == h3.get_num_cells(level)
        # The binary format uses float32 for fractional allocated population.
        assert abs(total - expected) < expected * 1e-7, (level, total, expected)
        print(f'H3 R{level}: {len(seen):,} distinct cells; summed population {total:,.1f}')
    cities = read('cities.json')
    sites = read('sites.json')
    heritage = read('heritage-points.json')
    assert len({c[0] for c in cities}) == len(cities) == atlas['counts']['cities']
    assert len({(s[1],s[0]) for s in sites}) == len(sites)
    assert len({s[9] for s in heritage}) == atlas['counts']['heritage']
    assert len(heritage) == atlas['counts']['heritagePoints']
    for row in cities + sites + heritage:
        assert row[3] is None or row[3] in keys
        assert -90 <= row[4] <= 90 and -180 <= row[5] <= 180
    locks = read('source-lock.json')
    assert set(locks) == set(atlas['sources'])
    assert all(len(s['sha256']) == 64 and s['bytes'] > 0 for s in locks.values())
    print(f'{len(keys)} mapped regions; {len(wdi)} matched economies; {len(metric_ids)} indicators; {len(locks)} source files')
    print(f'{len(cities):,} places; {len(sites):,} facilities; {len(heritage):,} World Heritage component points')


if __name__ == '__main__':
    validate()
