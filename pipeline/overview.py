"""Generate a small navigation-scale basemap. Region indexes match the full geometry."""

import json
from pathlib import Path

from shapely.geometry import LineString, Polygon


def rounded(coords):
    return [[round(lon,2),round(lat,2)] for lon,lat in coords]


def coarse(polygons):
    shapes = [Polygon(rings[0], rings[1:]) for rings in polygons if rings]
    if not shapes:
        return []
    largest = max(range(len(shapes)), key=lambda i: shapes[i].area)
    result=[]
    for i, polygon in enumerate(shapes):
        if i != largest and polygon.area < 0.035:
            continue
        shape = polygon.simplify(0.19, preserve_topology=True)
        if shape.is_empty:
            continue
        result.append([rounded(shape.exterior.coords), *[rounded(ring.coords) for ring in shape.interiors if Polygon(ring).area > 0.1]])
    return result


def pack_overview(output:Path):
    cities=json.loads((output/'cities.json').read_text())
    outlines=json.loads((output/'outlines.json').read_text())
    water=json.loads((output/'water.json').read_text())
    rivers=[[rank,name,rounded(LineString(points).simplify(0.1).coords)] for rank,name,points in water['rivers'] if rank <= 4 and len(points)>1]
    lakes=[[rank,name,coarse(polygons)] for rank,name,polygons in water['lakes'] if rank <= 3]
    data=dict(outlines=[coarse(c) for c in outlines],water=dict(rivers=rivers,lakes=lakes),cities=[c for c in cities if c[6]>=700000 or c[7]])
    (output/'overview.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')


if __name__=='__main__':
    pack_overview(Path(__file__).resolve().parents[1]/'web/data')
