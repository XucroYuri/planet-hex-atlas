import { formatPercent, msg, numberFormat } from './i18n.js';
import { continentName } from './i18n-places.js';

export { esc } from './i18n.js';

export const DATA = new URL('../data/', import.meta.url);
export const TILE_KM = { 2: 183, 3: 69, 4: 26 };
export function localizeMetric(metric) {
  const { name, group, unit, description } = metric;
  return {
    ...metric,
    name: msg(name),
    group: msg(group),
    ...(unit && { unit: msg(unit) }),
    ...(description && { description: msg(description) }),
  };
}
export const LOCAL_LENSES = [
  { id: 'terrain', name: '地形', group: '地球格网', scale: 'terrain' },
  { id: 'gridPop', name: '格网人口', unit: '人', group: '地球格网', scale: 'total', min: 100, max: 10000000 },
  { id: 'density', name: '人口密度', unit: '人/km²', group: '地球格网', scale: 'total', min: 0.1, max: 20000 },
  { id: 'height', name: '海拔与水深', unit: '米', group: '地球格网', scale: 'height', min: -9500, max: 6000 },
  { id: 'biome', name: '主要生态带', group: '地球格网', scale: 'biome' },
].map(localizeMetric);
export const TERRAIN = LOCAL_LENSES[0];
export const SITES = ['港口', '定期航班机场', '发电站', '世界遗产'].map(name => msg(name));
export const CONTINENTS = Object.fromEntries([
  'Asia', 'Europe', 'Africa', 'Oceania', 'North America', 'South America', 'Antarctica', 'Seven seas (open ocean)',
].map(name => [name, continentName(name)]));
export const LANDING_CITIES = ['1850147', '1796236', '5128581', '2643743', '360630', '3448439'];
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const wrap = (lon) => ((lon + 180) % 360 + 360) % 360 - 180;
export const near = (lon, center) => center + wrap(lon - center);
const compact = numberFormat({ notation: 'compact', maximumFractionDigits: 1 });
const decimal = numberFormat({ maximumFractionDigits: 2 });
const angle = numberFormat({ useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kilometers = numberFormat({ style: 'unit', unit: 'kilometer', unitDisplay: 'short' });

export function format(value, unit = '', concise = false) {
  if (!Number.isFinite(value)) return msg('无数据');
  if (unit === '%') return formatPercent(value);
  const shown = (concise && Math.abs(value) >= 1e4 ? compact : decimal).format(value);
  const label = msg(unit);
  return label ? `${shown} ${label}` : shown;
}

export const formatDistance = (value) => kilometers.format(value);

export function coordinates(lat, lon) {
  return `\u2066${angle.format(Math.abs(lat))}°${lat < 0 ? 'S' : 'N'}  ${angle.format(Math.abs(lon))}°${lon < 0 ? 'W' : 'E'}\u2069`;
}

export async function load(name, binary = false) {
  const response = await fetch(new URL(name, DATA));
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${name}`);
  return binary ? response.arrayBuffer() : response.json();
}

export function unpack(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 8 || view.getUint32(0) !== 0x48584131) throw new Error(msg('无效格网文件'));
  const count = view.getUint32(4, true);
  if (view.byteLength !== count * 20 + 8) throw new Error(msg('格网文件不完整'));
  return Array.from({ length: count }, (_, i) => {
    const index = i * 20 + 8;
    const id = view.getBigUint64(index, true).toString(16);
    const [lat, lon] = h3.cellToLatLng(id);
    return {
      id, lat, lon,
      elevation: view.getInt16(index + 8, true),
      region: view.getUint16(index + 10, true),
      biome: view.getUint8(index + 12),
      land: view.getUint8(index + 13) / 255,
      pop: view.getFloat32(index + 14, true),
    };
  });
}

export function tileKey(lat, lon) {
  return `${clamp(Math.floor((lat + 90) / 20), 0, 8)}-${Math.floor((wrap(lon) + 180) / 20)}`;
}

export function cellValue(cell, lens) {
  if (lens.id === 'gridPop') return cell.land > 0 || cell.pop > 0 ? cell.pop : null;
  if (lens.id === 'density') return cell.land > 0 || cell.pop > 0 ? cell.pop / h3.cellArea(cell.id, 'km2') : null;
  if (lens.id === 'height') return cell.elevation;
  return null;
}

const ramps = {
  local: ['#355666', '#47897f', '#9fb475', '#e4bd75', '#fae7ac'],
  national: ['#3a6169', '#4d8c82', '#9cb57d', '#efc978', '#f8edb9'],
  diverging: ['#a15257', '#be775f', '#cfb99a', '#76a89f', '#337e78'],
  height: ['#1e4460', '#487f9a', '#8da698', '#bd9b6c', '#f3e0bc'],
};

export function ramp(lens) {
  return ramps[lens.scale] || (lens.code ? ramps.national : ramps.local);
}

export function colorFor(lens, value, min, max) {
  if (!Number.isFinite(value)) return '#687b7b';
  let position = (value - min) / (max - min || 1);
  if (lens.scale === 'total') position = Math.log1p(Math.max(0, value) / Math.max(0.01, min)) / Math.log1p(max / Math.max(0.01, min));
  if (lens.scale === 'height') position = value < 0 ? 0.45 * (1 - clamp(-value / 9500, 0, 1)) : 0.45 + 0.55 * clamp(value / 6000, 0, 1);
  const colors = ramp(lens);
  const idx = Math.round(clamp(position, 0, 1) * (colors.length - 1));
  return colors[idx];
}

export function lensRange(lens, rows, read, year) {
  if (lens.min != null) return [lens.min, lens.max];
  const values = rows.map((c) => read(c.id, lens.id, year)).filter(Number.isFinite).sort((a, b) => a - b);
  if (!values.length) return [0, 1];
  const low = values[Math.floor((values.length - 1) * 0.08)];
  const high = values[Math.floor((values.length - 1) * 0.92)];
  if (lens.scale === 'diverging') {
    const abs = Math.max(1, Math.abs(low), Math.abs(high));
    return [-abs, abs];
  }
  if (lens.scale === 'total') return [Math.max(1, low), Math.max(2, high)];
  if (lens.scale === 'percent') return [0, 100];
  return low === high ? [Math.min(0, low), high + 1] : [low, high];
}

export function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const a = Math.sin((lat2-lat1)*rad/2)**2 + Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin((lon2-lon1)*rad/2)**2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, a)));
}
