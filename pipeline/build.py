"""Build the static atlas and H3 tiles from cached public datasets."""

import argparse
import csv
import io
import json
import math
import struct
from collections import Counter, defaultdict
from pathlib import Path
from zipfile import ZipFile

import h3.api.basic_int as h3
import h5py
import numpy as np
import rasterio
import shapefile
import shapely
from h3ronpy.vector import coordinates_to_cells
from PIL import Image
from pyproj import Transformer
from rasterio.features import rasterize
from rasterio.transform import from_bounds
from rasterio.windows import Window
from shapely.geometry import shape
from shapely.strtree import STRtree

from sources import INDICATORS, POPULATION_NAME, download

YEARS = list(range(1960, 2026))
LEVELS = (2, 3, 4)
BIOMES = [
    ("无分类", "#849986"), ("热带湿润阔叶林", "#476f5c"), ("热带干旱阔叶林", "#73824f"),
    ("热带针叶林", "#59785b"), ("温带阔叶与混交林", "#7d996f"), ("温带针叶林", "#628672"),
    ("寒带森林", "#698c81"), ("热带草原与灌丛", "#a6a36a"), ("温带草原与灌丛", "#a2ad80"),
    ("淹水草原与稀树草原", "#83a88c"), ("山地草甸与灌丛", "#99a184"), ("苔原", "#aab5b0"),
    ("地中海型林地与灌丛", "#a2a372"), ("沙漠与旱生灌丛", "#c5ac79"), ("红树林", "#629d89"),
    ("极地冰盖", "#d1dbd7"), ("内陆水面", "#698e9c"),
]
EXTRA_BIOMES = {98: 15, 99: 16, 0: 0}
FUEL_ZH = {"Coal": "煤炭", "Gas": "天然气", "Oil": "石油", "Hydro": "水力", "Nuclear": "核能", "Solar": "太阳能", "Wind": "风能", "Biomass": "生物质", "Geothermal": "地热", "Waste": "废弃物", "Other": "其他", "Storage": "储能", "Wave and Tidal": "潮汐与波浪", "Petcoke": "石油焦", "Cogeneration": "热电联产"}


def log(message):
    print(message, flush=True)


def dump(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n")


def rounded(value, digits=4):
    return round(float(value), digits)


def archive_rows(path, prefix):
    with ZipFile(path) as archive:
        name = next(n for n in archive.namelist() if n.rsplit("/", 1)[-1].startswith(prefix) and n.endswith(".csv"))
        with archive.open(name) as stream:
            yield from csv.reader(io.TextIOWrapper(stream, encoding="utf-8-sig", newline=""))


def read_indicators(cache):
    output = {}
    summary = []
    for key, code, name, unit, group, scale, description in INDICATORS:
        rows = iter(archive_rows(cache / f"wdi-{key}.zip", "API_"))
        updated = None
        for row in rows:
            if row and row[0] == "Last Updated Date":
                updated = row[1]
            if row and row[0] == "Country Name":
                indexes = [row.index(str(year)) if str(year) in row else None for year in YEARS]
                break
        coverage = 0
        for row in rows:
            if len(row) < 4:
                continue
            series = [float(row[i]) if i is not None and i < len(row) and row[i].strip() else None for i in indexes]
            if any(value is not None for value in series):
                output.setdefault(row[1], {})[key] = series
                coverage += 1
        if not coverage:
            raise ValueError(f"Indicator is empty: {code}")
        summary.append(dict(id=key, code=code, name=name, unit=unit, group=group, scale=scale, description=description, updated=updated))
    return output, summary


def extract_shapes(path, tolerance, encoding='utf-8'):
    reader = shapefile.Reader(str(path), encoding=encoding)
    for item in reader.iterShapeRecords():
        if item.shape.shapeType == shapefile.NULL:
            continue
        polygon = shape(item.shape.__geo_interface__)
        if tolerance:
            polygon = polygon.simplify(tolerance, preserve_topology=True)
        if not polygon.is_empty:
            yield item.record.as_dict(), polygon


def polygons(geometry):
    if geometry.geom_type == "Polygon":
        return [geometry]
    return [polygon for part in geometry.geoms for polygon in polygons(part)] if hasattr(geometry, "geoms") else []


def lines(geometry):
    if geometry.geom_type == "LineString":
        return [geometry]
    return [line for part in geometry.geoms for line in lines(part)] if hasattr(geometry, "geoms") else []


def xy(coords):
    return [[rounded(x, 3), rounded(y, 3)] for x, y in coords]


def poly_coords(geometry):
    return [[xy(p.exterior.coords), *[xy(ring.coords) for ring in p.interiors]] for p in polygons(geometry)]


def generate_geography(cache, output, wdi):
    countries = []
    geometry = []
    outlines = []
    names = {row['id']: row for row in json.loads((cache / 'regions.json').read_text())[1] if row['region']['value'] != 'Aggregates'}
    shapes = sorted(extract_shapes(cache / "atlas-country.zip", 0.012), key=lambda row: row[0]["ADM0_A3"])
    for record, polygon in shapes:
        code = record["ADM0_A3"]
        iso2 = next((record[k] for k in ("ISO_A2", "ISO_A2_EH", "WB_A2") if str(record[k]).isalpha()), "")
        wdi_key = next((r for r in (record["WB_A3"], record["ISO_A3"], record["ISO_A3_EH"], code) if r in names and r in wdi), None)
        if code == 'KOS' and 'XKX' in wdi:
            wdi_key = 'XKX'
        continent = record["CONTINENT"]
        countries.append(dict(id=code, name=record["NAME_EN"] or record["NAME"], zh=record["NAME_ZH"] or record["NAME"], iso2=iso2,
                              continent=continent, wdi=wdi_key, lat=rounded(record['LABEL_Y']), lon=rounded(record['LABEL_X']),
                              rank=record['LABELRANK'], bounds=[rounded(v, 2) for v in polygon.bounds]))
        geometry.append(polygon)
        outlines.append(poly_coords(polygon.simplify(0.035, preserve_topology=True)))
    if len({c['id'] for c in countries}) != len(countries):
        raise ValueError('Natural Earth ADM0 ids are not unique')
    duplicate_series = Counter(c['wdi'] for c in countries if c['wdi'])
    for country in countries:
        if duplicate_series[country['wdi']] > 1 and country['id'] != country['wdi']:
            country['wdi'] = None
        country['zh'] = {'CHN': '中国', 'TWN': '台湾'}.get(country['id'], country['zh'])
    dump(output / "outlines.json", outlines)
    waterways = {
        "rivers": [[r["scalerank"], r["name_zh"] or r["name"], xy(l.coords)] for r, g in extract_shapes(cache / "atlas-rivers.zip", 0.018) for l in lines(g)],
        "lakes": [[r["scalerank"], r["name_zh"] or r["name"], poly_coords(g)] for r, g in extract_shapes(cache / "atlas-lakes.zip", 0.018)],
    }
    dump(output / "water.json", waterways)
    neighbors = [set() for _ in geometry]
    valid = [shapely.make_valid(g) for g in geometry]
    tree = STRtree(valid)
    for i, polygon in enumerate(valid):
        for j in tree.query(polygon.buffer(0.04), predicate="intersects"):
            if i < j and polygon.boundary.intersection(valid[j].buffer(0.04)).length > 0.17:
                # A graphical adjacency, not a treaty or a measured trade flow.
                neighbors[i].add(countries[j]['id'])
                neighbors[j].add(countries[i]['id'])
    for c, adjacent in zip(countries, neighbors, strict=True):
        c['neighbors'] = sorted(adjacent)
    return countries, geometry


def population_by_cell(cache, ids):
    path = cache / "population.zip"
    with ZipFile(path) as archive:
        name = f"{POPULATION_NAME}_V1_0.tif"
        info = archive.getinfo(name)
        fingerprint = f'{info.CRC:08x}-{info.file_size}'
        result_path = cache / f'population-h3r4-{fingerprint}.npy'
        if result_path.exists():
            result = np.load(result_path)
            if result.shape == ids.shape:
                return result
        folder = cache / fingerprint
        raster = folder / name
        if not raster.exists() or raster.stat().st_size != info.file_size:
            archive.extract(name, folder)
    population = np.zeros(len(ids), dtype=np.float64)
    with rasterio.open(raster) as source:
        projection = Transformer.from_crs(source.crs, 'EPSG:4326', always_xy=True)
        for row in range(0, source.height, 256):
            block = source.read(1, window=Window(0, row, source.width, min(256, source.height-row)))
            yy, xx = np.nonzero(block > 0)
            if not len(yy):
                continue
            x, y = source.transform * (xx + 0.5, yy + row + 0.5)
            lon, lat = projection.transform(x, y)
            valid = np.isfinite(lat) & np.isfinite(lon)
            cell = np.asarray(coordinates_to_cells(lat[valid], lon[valid], 4))
            index = np.searchsorted(ids, cell)
            if not np.array_equal(ids[index], cell):
                raise ValueError('H3 and h3ronpy disagree on cell ids')
            population += np.bincount(index, weights=block[yy[valid], xx[valid]], minlength=len(ids))
    np.save(result_path, population)
    return population


def make_relief(cache, output, geometries):
    with h5py.File(cache / "relief.grd") as file:
        z = (file["z"][:].astype(np.float32) * file["z"].attrs["scale_factor"][0])[::-1, :-1][:-1]
    # Retain source metadata: a 6 arc-minute grid, then color it for the browser.
    transform = from_bounds(-180, -90, 180, 90, z.shape[1], z.shape[0])
    land = rasterize(((g, i+1) for i, g in enumerate(geometries)), out_shape=z.shape, transform=transform, dtype="uint16")
    parts = []
    for rec, geom in extract_shapes(cache / "biomes.zip", 0.035, encoding='latin-1'):
        code = int(rec['BIOME_NUM'])
        code = EXTRA_BIOMES.get(code, code if 1 <= code <= 14 else 0)
        if code:
            parts.append((geom, code))
    eco = rasterize(parts, out_shape=z.shape, transform=transform, dtype='uint8')
    glaciers = rasterize(((geom, 1) for _, geom in extract_shapes(cache / 'glaciers.zip', 0.02)), out_shape=z.shape, transform=transform, dtype='uint8')
    eco[(glaciers == 1) & (land > 0)] = 15
    palette = np.asarray([tuple(bytes.fromhex(color[1:])) for _, color in BIOMES], dtype=np.float32)
    land_color = palette[eco]
    high = np.clip((z-150) / 4600, 0, 1) ** 0.66
    land_color = land_color * (1 - high[:, :, None] * 0.85) + np.array([223, 183, 145]) * high[:, :, None] * 0.85
    ice = ((eco == 15) | ((z > 4600) & (np.abs(np.linspace(90, -90, z.shape[0]))[:, None] > 25)))
    land_color[ice] = [222, 228, 213]
    depth = np.clip(-z / 7400, 0, 1) ** 0.47
    ocean_color = np.array([70, 121, 135]) * (1 - depth[:, :, None]) + np.array([18, 44, 58]) * depth[:, :, None]
    dy, dx = np.gradient(z)
    slope = np.clip((-dx-dy) / 2300, -0.24, 0.21) + 1
    color = np.where((land > 0)[:, :, None], land_color * slope[:, :, None], ocean_color * (0.96 + (slope - 1)[:, :, None] * 0.5))
    # Neutral fine-grained bathymetric contours that survive the overview downsample.
    contour = (z < -250) & (np.floor(z / 500) != np.floor(np.roll(z, 1, axis=0) / 500)) & (land == 0)
    color[contour] *= 1.045
    image = Image.fromarray(np.clip(color, 0, 255).astype(np.uint8))
    image.save(output / 'relief.webp', quality=82, method=6)
    return z, land, eco


def world_centers(ids):
    coords = np.asarray([h3.cell_to_latlng(int(cell)) for cell in ids])
    return coords[:, 0], coords[:, 1]


def sample(raster, lat, lon):
    height, width = raster.shape
    row = np.clip(((90-lat) * height / 180).astype(int), 0, height-1)
    col = (((lon+180) % 360) * width / 360).astype(int)
    return raster[row, col]


def group(ids, population, country, biome, elevation, land, area, level):
    if level == 4:
        return ids, population, country, biome, elevation, land
    # H3 hierarchical parents are logical rather than exact geometric unions.
    parent = (ids & np.uint64(~((1 << 52) | (1 << 53) | (1 << 54) | (1 << 55)) & 0xFFFFFFFFFFFFFFFF)) | np.uint64(level << 52)
    parent |= np.uint64((1 << (3 * (15 - level))) - 1)
    keys = np.asarray(sorted(h3.uncompact_cells(list(h3.get_res0_cells()), level)), dtype=np.uint64)
    index = np.searchsorted(keys, parent)
    if not np.array_equal(keys[index], parent):
        raise ValueError(f'Incorrect H3 parent indexing for level {level}')
    summed = np.bincount(index, weights=population, minlength=len(keys))
    weight = area * land
    cell_area = np.bincount(index, weights=area, minlength=len(keys))
    land_area = np.bincount(index, weights=weight, minlength=len(keys))
    land_elevation = np.bincount(index, weights=elevation * weight, minlength=len(keys))
    sea_elevation = np.bincount(index, weights=elevation * area, minlength=len(keys))
    mean = np.where(land_area > 0, land_elevation / np.maximum(0.001, land_area), sea_elevation / cell_area)
    weights_by_code = (np.bincount(index * (int(country.max()) + 1) + country, weights=weight,
                                  minlength=len(keys) * (int(country.max()) + 1)).reshape(len(keys), -1))
    weights_by_biome = np.bincount(index * len(BIOMES) + biome, weights=weight, minlength=len(keys) * len(BIOMES)).reshape(len(keys), -1)
    return keys, summed, weights_by_code.argmax(axis=1), weights_by_biome.argmax(axis=1), mean, land_area / cell_area


def tile_name(lat, lon):
    return f"{int(min(8, (lat+90)//20))}-{int(((lon+180)%360)//20)}"


def pack_tiles(cache, output, elevation_raster, land_raster, biome_raster, geometry):
    ids = np.asarray(sorted(h3.uncompact_cells(list(h3.get_res0_cells()), 4)), dtype=np.uint64)
    log('Aggregating positive GHSL raster pixels into H3 r4')
    population = population_by_cell(cache, ids)
    area = np.asarray([h3.cell_area(int(cell), unit='km^2') for cell in ids])
    lat, lon = world_centers(ids)
    elevation = sample(elevation_raster, lat, lon)
    countries = sample(land_raster, lat, lon)
    biomes = sample(biome_raster, lat, lon)
    coverage = np.zeros(len(ids), dtype=np.float32)
    # Exact centre membership captures some inner-border slivers missed by the colour raster.
    matches = STRtree(geometry).query(shapely.points(lon, lat), predicate='within')
    countries[matches[0]] = matches[1] + 1
    for sample_index in range(7):
        theta = sample_index * math.tau / 6
        radius = 0 if sample_index == 0 else 0.18
        lp = np.clip(lat + radius * np.cos(theta), -90, 90)
        lg = lon + radius * np.sin(theta) / np.clip(np.cos(np.deg2rad(lat)), 0.15, 1)
        coverage += (sample(land_raster, lp, lg) > 0)
    coverage /= 7
    uncovered = (coverage == 0) & (countries != 0)
    coverage[uncovered] = 1 / 7
    tile_manifest = {}
    record = struct.Struct('<QhHBBfH')
    for level in LEVELS:
        key, pop, over, zones, meters, ratio = group(ids, population, countries, biomes, elevation, coverage, area, level)
        tiles = defaultdict(bytearray)
        level_lat, level_lon = world_centers(key)
        for cell in zip(key, pop, over, zones, meters, ratio, level_lat, level_lon, strict=True):
            cell_id, people, country, ecoregion, z, terrestrial, y, x = cell
            tile = 'world' if level == 2 else tile_name(y, x)
            tiles[tile] += record.pack(int(cell_id), round(z), int(country), int(ecoregion), round(terrestrial*255), float(people), 0)
        for tile, blob in tiles.items():
            path = output / f'h{level}' / f'{tile}.bin'
            path.parent.mkdir(exist_ok=True)
            path.write_bytes(struct.pack('<4sI', b'HXA1', len(blob)//record.size) + blob)
        tile_manifest[str(level)] = sorted(tiles)
        log(f'H3 r{level}: {len(key):,} cells, {len(tiles)} files, population {pop.sum():,.0f}')
    return tile_manifest, dict(cells=len(ids), landCells=int((coverage > 0).sum()), gridPopulation=round(population.sum()))


def localized_names(cache):
    names = defaultdict(list)
    for rec, geom in extract_shapes(cache / 'places.zip', 0):
        zh = rec.get('NAME_ZH')
        if not zh:
            continue
        for field in ('NAME_EN', 'NAMEASCII', 'NAME'):
            key = str(rec.get(field) or '').casefold()
            names[key].append((geom.y, geom.x, zh))
    return names


def lookup_indices(geometry, coords, fallback=None):
    if not coords:
        return []
    tree = STRtree(geometry)
    points = shapely.points(coords)
    p, g = tree.query(points, predicate='within')
    result = np.full(len(coords), -1, dtype=int)
    result[p] = g
    if fallback:
        miss = np.flatnonzero(result < 0)
        (i, j), _ = tree.query_nearest(points[miss], max_distance=fallback, all_matches=False, return_distance=True)
        result[miss[i]] = j
    return result


def generate_cities(cache, output, countries, geometry):
    local = localized_names(cache)
    iso2 = {country['iso2']: country['id'] for country in countries if country['iso2']}
    grouped = defaultdict(list)
    with ZipFile(cache / 'cities500.zip') as archive, archive.open('cities500.txt') as stream:
        for row in csv.reader(io.TextIOWrapper(stream, encoding='utf-8'), delimiter='\t'):
            if len(row) < 19 or row[7] in ('PPLX', 'PPLQ', 'PPLW'):
                continue
            y, x, pop = float(row[4]), float(row[5]), int(row[14])
            is_capital = row[7] in ('PPLC', 'PPLG')
            candidates = local[row[1].casefold()] + local[row[2].casefold()] if pop >= 30000 or is_capital else []
            zh = min(candidates, key=lambda c: abs(c[0]-y) + abs(c[1]-x), default=(1000, 1000, ''))
            alias = zh[2] if abs(zh[0]-y) + abs(zh[1]-x) < 0.7 else next((term for term in row[3].split(',') if term and all('\u3400' <= ch <= '\u9fff' for ch in term)), '')
            grouped[row[8]].append([row[0], row[1], alias, row[8], rounded(y), rounded(x), pop, int(is_capital)])
    selected = []
    for rows in grouped.values():
        ranked = sorted(rows, key=lambda c: (-c[6], c[0]))
        selected += [c for i, c in enumerate(ranked) if i < 6 or c[6] >= 42000 or c[7]]
    selected.sort(key=lambda c: (-c[6], c[0]))
    unknown = [i for i, c in enumerate(selected) if c[3] not in iso2]
    areas = lookup_indices(geometry, [(selected[i][5], selected[i][4]) for i in unknown], fallback=0.55)
    overrides = {i: countries[j]['id'] for i, j in zip(unknown, areas, strict=True) if j >= 0}
    for i, c in enumerate(selected):
        c.append(c[3])  # Retain the gazetteer's territory tag even for tiny unmapped islands.
        c[3] = iso2.get(c[3], overrides.get(i))
    dump(output / 'cities.json', selected)
    return len(selected)


def generate_infrastructure(cache, output, countries, geometry):
    by_iso2 = {row['iso2']: row['id'] for row in countries if row['iso2']}
    by_iso3 = {k: row['id'] for row in countries for k in (row['id'], row['wdi']) if k}
    sites = []
    for index, (rec, geom) in enumerate(extract_shapes(cache / 'ports.zip', 0)):
        sites.append([f'NEP-{index + 1}', 0, rec['name'], None, rounded(geom.y), rounded(geom.x), int(rec['scalerank']), ''])
    with (cache / 'airports.csv').open() as source:
        for row in csv.DictReader(source):
            if row['type'] not in ('large_airport', 'medium_airport') or row['scheduled_service'] != 'yes':
                continue
            sites.append([row['ident'], 1, row['name'], by_iso2.get(row['iso_country']), rounded(row['latitude_deg']), rounded(row['longitude_deg']), 1 if row['type'] == 'large_airport' else 0, row['iata_code']])
    with ZipFile(cache / 'power.zip') as archive:
        name = next(n for n in archive.namelist() if n.endswith('global_power_plant_database.csv'))
        with archive.open(name) as raw:
            for row in csv.DictReader(io.TextIOWrapper(raw, encoding='utf-8-sig', newline="")):
                if not row['latitude'] or not row['longitude'] or not row['capacity_mw']:
                    continue
                sites.append([row['gppd_idnr'], 2, row['name'], by_iso3.get(row['country']), rounded(row['latitude']), rounded(row['longitude']), rounded(row['capacity_mw'], 2), FUEL_ZH.get(row['primary_fuel'], row['primary_fuel'])])
    missing = [i for i, s in enumerate(sites) if not s[3]]
    areas = lookup_indices(geometry, [(sites[i][5], sites[i][4]) for i in missing], fallback=0.6)
    for i, j in zip(missing, areas, strict=True):
        if j >= 0:
            sites[i][3] = countries[j]['id']
    dump(output / 'sites.json', sites)
    return Counter(s[1] for s in sites)


def generate_heritage(cache, output, countries, geometry):
    catalog = json.loads((cache / 'heritage.json').read_text())
    by_iso = {c['iso2']: c['id'] for c in countries if c['iso2']}
    points = []
    for row in catalog:
        geo = (row.get('coordinates') or {}).get('geometry') or {}
        coords = geo.get('coordinates') or []
        if geo.get('type') == 'Point':
            coords = [coords]
        codes = row.get('iso_codes') or []
        country = by_iso.get(codes[0]) if len(codes) == 1 else None
        category = {'Natural': '自然遗产', 'Cultural': '文化遗产', 'Mixed': '文化与自然双重遗产'}.get(row['category'], row['category'])
        coords = list(dict.fromkeys((rounded(x), rounded(y)) for x, y in coords))
        for i, (x, y) in enumerate(coords):
            points.append([f"{row['id_no']}-{i + 1}", 3, row['name_zh'] or row['name_en'], country, y, x,
                           int(row['date_inscribed']), category, row['name_en'], row['id_no'], i + 1, len(coords)])
    missing = [i for i, p in enumerate(points) if not p[3]]
    areas = lookup_indices(geometry, [(points[i][5], points[i][4]) for i in missing], fallback=0.6)
    for i, j in zip(missing, areas, strict=True):
        if j >= 0:
            points[i][3] = countries[j]['id']
    dump(output / 'heritage-points.json', points)
    return dict(heritage=len({p[9] for p in points}), heritageListed=len(catalog), heritagePoints=len(points))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=Path('.cache'))
    parser.add_argument('--output', type=Path, default=Path('web/data'))
    parser.add_argument('--download', action='store_true')
    args = parser.parse_args()
    if args.download:
        download(args.cache)
    cache, output = args.cache, args.output
    output.mkdir(parents=True, exist_ok=True)
    wdi, metrics = read_indicators(cache)
    countries, geom = generate_geography(cache, output, wdi)
    log(f'Saved {len(countries)} map regions and {len(metrics)} annual indicators')
    sources = json.loads((cache / 'sources.json').read_text())
    import hashlib
    hashes = {}
    for name, url in sources.items():
        file = cache / name
        with file.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        hashes[name] = dict(url=url, bytes=file.stat().st_size, sha256=digest)
    dump(output / 'source-lock.json', hashes)
    dump(output / 'observations.json', {r['id']: wdi[r['wdi']] for r in countries if r['wdi']} | {'WLD': wdi['WLD']})
    city_count = generate_cities(cache, output, countries, geom)
    site_counts = generate_infrastructure(cache, output, countries, geom)
    heritage = generate_heritage(cache, output, countries, geom)
    log(f'Saved {city_count:,} cities and {sum(site_counts.values()):,} infrastructure points')
    height, land, eco = make_relief(cache, output, geom)
    tiles, counts = pack_tiles(cache, output, height, land, eco, geom)
    manifest = dict(years=YEARS, year=2023, gridYear=2020, countries=countries, tiles=tiles, biomes=BIOMES, metrics=metrics, sources=sources,
                    counts=counts | heritage | dict(regions=len(countries), indicators=len(metrics), cities=city_count,
                                         ports=site_counts[0], airports=site_counts[1], power=site_counts[2]))
    dump(output / 'atlas.json', manifest)
    log(f'Atlas ready in {output}')


if __name__ == '__main__':
    main()
