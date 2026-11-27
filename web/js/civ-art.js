import { drawCityTile } from '../vendor/usaciv/render/art/city.js';
import { drawPort, drawAirport } from '../vendor/usaciv/render/art/improvements.js';
import { paintClump, paintMountain, paintDune, paintIce, paintMarsh, paintTuft } from '../vendor/usaciv/render/art/terrain.js';

const painters = { forest: paintClump, mountain: paintMountain, dune: paintDune, ice: paintIce, marsh: paintMarsh, grass: paintTuft };
const atlas = new Map();
const units = 42;

function glyph(kind, variant, style) {
  const key = `${kind}/${variant}/${style}`;
  if (!atlas.has(key)) {
    const cv = document.createElement('canvas');
    cv.width = 104; cv.height = 94;
    const ctx = cv.getContext('2d');
    ctx.setTransform(units, 0, 0, units, 52, 72);
    painters[kind](ctx, units, variant, style);
    atlas.set(key, cv);
  }
  return atlas.get(key);
}

function terrainType(cell) {
  if (cell.elevation >= 1600) return ['mountain', cell.elevation > 3800 ? 'peak' : cell.biome === 13 ? 'arid' : 'green'];
  if (cell.biome === 15) return ['ice', 'polar'];
  if (cell.biome === 13) return ['dune', 'sand'];
  if ([9,14].includes(cell.biome)) return ['marsh', 'wetland'];
  if (cell.biome > 0 && cell.biome <= 6) return ['forest', cell.biome >= 5 ? 'conif' : 'mixed'];
  return ['grass', 'meadow'];
}

export function paintLand(map, tiles) {
  if (map.projection !== 'flat' || map.level !== 4 || !map.options.art || map.lens?.id !== 'terrain') return;
  const scale = map.camera.scale;
  if (scale < 38) return;
  const size = Math.max(10, Math.min(49, scale * .26));
  const { ctx } = map;
  const visible = [];
  for (const { cells } of tiles) for (const cell of cells) {
    if (cell.land < .45 || cell.pop > 220000) continue;
    const [x, y] = map.screen(cell.lat, cell.lon);
    if (!map.inside(x, y, size)) continue;
    const seed = parseInt(cell.id.slice(4, 10), 16);
    // Sparse glyphs represent typical biome or relief. Settlement sites use a separate source.
    if (seed % (scale < 64 ? 4 : 2) === 1) continue;
    visible.push({ cell, x, y, variant: (seed >>> 3) % 6 });
  }
  visible.sort((a,b) => a.y-b.y);
  for (const {cell,x,y,variant} of visible) {
    const [kind,style] = terrainType(cell);
    const image = glyph(kind,variant,style);
    ctx.drawImage(image, x-size*52/units, y-size*61/units, size*image.width/units, size*image.height/units);
  }
}

export function cityGlyph(ctx, item, x, y, scale) {
  const population = item[6];
  const size = Math.min(50, Math.max(9, scale*.22 + Math.max(0, Math.log10(Math.max(1,population))-4)*1.6));
  drawCityTile(ctx, { population, capital: false, name: item[1] }, x, y, size, { seed: Number(item[0]), Rpx: size, s: 1, stateColor: [180,157,101] });
  return size;
}

export function siteGlyph(ctx, type, x, y, size) {
  if (type === 0) drawPort(ctx, x, y, 17, { tier: size <= 3 ? 0 : 2 });
  else if (type === 1) drawAirport(ctx, x, y, 17, { tier: size ? 1 : 3 });
  else return false;
  return true;
}
