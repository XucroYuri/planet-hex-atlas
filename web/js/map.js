import { DATA, TILE_KM, cellValue, clamp, colorFor, coordinates, format, load, near, tileKey, unpack, wrap } from './data.js';
import { Globe } from './globe.js';
import { paintLand, cityGlyph, siteGlyph } from './civ-art.js';

const GROUND = '#294f60';
const GRID_LABEL = '#b7d2d3';
const SITE_COLORS = ['#7bd4d7', '#f1ead4', '#eead69', '#e7a7a8'];
const OCEANS = [['太平洋', 4, -147], ['太平洋', 8, 165], ['大西洋', 13, -43], ['印度洋', -25, 73], ['北冰洋', 76, -30], ['南大洋', -57, -55]];

function addLine(path, points, close = false) {
  if (!points.length) return;
  path.moveTo(points[0][0], -points[0][1]);
  for (let i = 1; i < points.length; i++) path.lineTo(points[i][0], -points[i][1]);
  if (close) path.closePath();
}

function polygonPath(polygons) {
  const path = new Path2D();
  for (const rings of polygons) for (const ring of rings) addLine(path, ring, true);
  return path;
}

function hexPath(cell) {
  if (cell.path) return cell.path;
  const boundary = h3.cellToBoundary(cell.id);
  let lon = cell.lon;
  const points = boundary.map(([lat, lng]) => {
    lon = near(lng, lon);
    return [lon, lat];
  });
  const [start, lat] = points[0];
  const end = near(start, lon);
  if (Math.abs(end - start) > 180) {
    const pole = cell.lat > 0 ? 90 : -90;
    points.push([end, lat], [end, pole], [start, pole]);
  }
  cell.path = new Path2D();
  addLine(cell.path, points, true);
  return cell.path;
}

function tileLevel(scale) { return scale > 31 ? 4 : scale > 8.8 ? 3 : 2; }

export class AtlasMap {
  constructor(canvas, manifest, onChange, onSelect, onHover, onProblem) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.hitCtx = document.createElement('canvas').getContext('2d');
    this.manifest = manifest;
    this.onChange = onChange;
    this.onSelect = onSelect;
    this.onHover = onHover;
    this.onProblem = onProblem;
    this.projection = 'globe';
    this.globe = new Globe();
    this.camera = { lat: 21, lon: 66, scale: 1 };
    this.outlines = [];
    this.relief = new Image();
    this.relief.onload = () => { this.globe.invalidate(); this.repaint(); };
    this.relief.onerror = () => onProblem('底图加载失败');
    this.relief.src = new URL('relief.webp', DATA).href;
    this.cities = [];
    this.sites = [];
    this.rivers = [];
    this.lakes = [];
    this.data = new Map();
    this.pending = new Map();
    this.failed = new Map();
    this.pointers = new Map();
    this.hits = [];
    this.level = 2;
    this.options = { grid: true, labels: true, art: true, sites: new Set() };
    this.selected = null;
    this.resize = new ResizeObserver(() => this.measure());
    this.resize.observe(canvas);
    this.attachInput();
  }

  async getTile(level, name) {
    const key = `${level}/${name}`;
    if (this.data.has(key)) return this.data.get(key);
    if (this.pending.has(key)) return this.pending.get(key);
    if ((this.failed.get(key) || 0) > Date.now() - 10000) return null;
    const pending = load(`h${level}/${name}.bin`, true).then((buffer) => {
      const cells = unpack(buffer);
      const tile = { cells, index: new Map(cells.map((cell) => [cell.id, cell])) };
      this.failed.delete(key);
      this.data.set(key, tile);
      if (level === 2) this.globe.invalidate();
      this.repaint();
      return tile;
    }).catch(() => {
      this.failed.set(key, Date.now());
      this.onProblem('部分六角格加载失败。平移或缩放可重试。');
      return null;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, pending);
    return pending;
  }

  setGeography(outlines, water) {
    this.outlines = outlines.map(polygonPath);
    this.globe.invalidate();
    this.rivers = water.rivers.map(([rank, , coords]) => {
      const path = new Path2D();
      addLine(path, coords);
      return { rank, path };
    });
    this.lakes = water.lakes.map(([rank, , coords]) => ({ rank, path: polygonPath(coords) }));
    this.repaint();
  }

  setCities(cities) { this.cities = cities; this.repaint(); }
  setSites(sites) { this.sites = sites; this.repaint(); }
  setLens(lens, range, countryValues) { this.lens = lens; this.range = range; this.countryValues = countryValues; this.globe.invalidate(); this.repaint(); }
  setSelection(selected) { this.selected = selected; this.repaint(); }
  setOptions(options) { this.options = options; this.globe.invalidate(); this.repaint(); }

  measure() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.minScale = Math.min(width / 368, height / 190);
    if (!this.measured || this.fitted) this.world();
    this.measured = true;
    this.repaint();
  }

  world() {
    this.camera = { lat: this.projection === 'globe' ? 21 : 2, lon: this.projection === 'globe' ? 66 : 5, scale: this.minScale || 1 };
    this.fitted = true;
    this.changed();
  }

  setProjection(mode) {
    this.projection = mode === 'flat' ? 'flat' : 'globe';
    this.world();
  }

  focus(lat, lon, scale = 38, mode = 'flat') {
    this.projection = mode;
    this.camera = { lat: clamp(lat, -90, 90), lon: wrap(lon), scale: clamp(scale, this.minScale || 1, 290) };
    this.fitted = false;
    this.changed();
  }

  screen(lat, lon) {
    if (this.projection === 'globe') return this.globe.project(this, lat, lon);
    const c = this.camera;
    return [this.width / 2 + (near(lon, c.lon) - c.lon) * c.scale, this.height / 2 - (lat - c.lat) * c.scale];
  }

  geo(x, y) {
    if (this.projection === 'globe') return this.globe.inverse(this, x, y);
    const c = this.camera;
    return [c.lat - (y - this.height / 2) / c.scale, wrap(c.lon + (x - this.width / 2) / c.scale)];
  }

  zoom(factor, x = this.width / 2, y = this.height / 2) {
    const c = this.camera;
    let [lat, lon] = this.geo(x, y);
    if (!Number.isFinite(lat)) { lat = c.lat; lon = c.lon; }
    const scale = clamp(c.scale * factor, this.minScale, 290);
    if (this.projection === 'globe') {
      if (scale > this.minScale * 2.1) this.focus(lat, lon, Math.max(14, this.minScale * 5));
      else this.focus(c.lat, c.lon, scale, 'globe');
      return;
    }
    this.focus(lat + (y - this.height / 2) / scale, lon - (x - this.width / 2) / scale, scale);
  }

  pan(dx, dy) {
    const c = this.camera;
    if (this.projection === 'globe') {
      const degrees = 57.2958 / this.globe.geometry(this).radius;
      this.focus(c.lat + dy * degrees, c.lon - dx * degrees / Math.max(.35, Math.cos(c.lat * Math.PI / 180)), c.scale, 'globe');
    } else this.focus(c.lat + dy / c.scale, c.lon - dx / c.scale, c.scale);
  }

  changed() {
    this.repaint();
    this.onChange(this.camera, this.level);
  }

  repaint() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      if (this.width) this.draw();
    });
  }

  visibleTiles(level, bounds) {
    if (level === 2) return ['world'];
    const [west, south, east, north] = bounds;
    const list = new Set();
    const padding = level === 3 ? 4 : 2;
    for (let y = Math.max(0, Math.floor((south + 90 - padding) / 20)); y <= Math.min(8, Math.floor((north + 90 + padding) / 20)); y++) {
      for (let x = Math.floor((west + 180 - padding) / 20); x <= Math.floor((east + 180 + padding) / 20); x++) {
        list.add(`${y}-${(x % 18 + 18) % 18}`);
      }
    }
    return [...list];
  }

  currentTiles(bounds) {
    const requested = tileLevel(this.camera.scale);
    const names = this.visibleTiles(requested, bounds);
    for (const name of names) {
      if (!this.data.has(`${requested}/${name}`)) void this.getTile(requested, name);
    }
    const ready = names.every((name) => this.data.has(`${requested}/${name}`));
    const level = ready ? requested : 2;
    if (this.level !== level) {
      this.level = level;
      this.onChange(this.camera, level);
    }
    return (ready ? names : ['world']).map((name) => this.data.get(`${level}/${name}`)).filter(Boolean);
  }

  bearingBounds() {
    const { lon, lat, scale } = this.camera;
    const dx = this.width / 2 / scale;
    const dy = this.height / 2 / scale;
    return [lon - dx, Math.max(-90, lat - dy), lon + dx, Math.min(90, lat + dy)];
  }

  countryAt(lat, lon) {
    for (let i = 0; i < this.outlines.length; i++) {
      const [west, south, east, north] = this.manifest.countries[i].bounds;
      if (lon >= west - .02 && lon <= east + .02 && lat >= south - .02 && lat <= north + .02 && this.hitCtx.isPointInPath(this.outlines[i], lon, -lat, 'evenodd')) {
        return this.manifest.countries[i];
      }
    }
    return null;
  }

  placeCell(level, lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90) return null;
    const id = h3.latLngToCell(lat, lon, level);
    const [y, x] = h3.cellToLatLng(id);
    const name = level === 2 ? 'world' : tileKey(y, x);
    return { id, name, cell: this.data.get(`${level}/${name}`)?.index.get(id) };
  }

  async details(lat, lon, level = this.projection === 'globe' ? 2 : tileLevel(this.camera.scale)) {
    const hit = this.placeCell(level, lat, lon);
    if (!hit) return null;
    const tile = hit.cell ? null : await this.getTile(level, hit.name);
    const cell = hit.cell || tile?.index.get(hit.id);
    return cell ? { type: 'cell', cell, level, lat, lon, country: this.countryAt(lat, lon) || this.manifest.countries[cell.region - 1] || null } : null;
  }

  draw() {
    const { ctx, camera: c, width, height, dpr } = this;
    if (this.projection === 'globe') {
      if (!this.data.has('2/world')) void this.getTile(2, 'world');
      this.level = 2;
      this.globe.draw(this);
      this.onChange(c, 2);
      return;
    }
    const bounds = this.bearingBounds();
    const [west, south, east, north] = bounds;
    const tiles = this.currentTiles(bounds);
    const offsets = [0, -360, 360].filter((offset) => west < 184 + offset && east > -184 + offset);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = GROUND;
    ctx.fillRect(0, 0, width, height);
    ctx.translate(width / 2 - c.lon * c.scale, height / 2 + c.lat * c.scale);
    ctx.scale(c.scale, c.scale);
    for (const offset of offsets) {
      ctx.save();
      ctx.translate(offset, 0);
      if (this.relief.complete && this.relief.naturalWidth) ctx.drawImage(this.relief, -180, -90, 360, 180);
      this.drawCountries(west - offset, south, east - offset, north);
      this.drawCells(tiles, west - offset, south, east - offset, north);
      this.drawWater();
      ctx.restore();
    }
    this.drawGraticule();
    this.drawSelection(offsets);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.hits = [];
    paintLand(this, tiles);
    this.drawLabels();
    this.drawPlaces();
  }

  drawCountries(west, south, east, north) {
    const { ctx, camera: { scale } } = this;
    const national = this.lens?.code;
    ctx.lineWidth = Math.min(1.05, .55 + scale / 60) / scale;
    ctx.strokeStyle = national ? '#e8e2ca83' : '#203c3a92';
    for (let i = 0; i < this.outlines.length; i++) {
      const row = this.manifest.countries[i];
      if (row.bounds[2] < west || row.bounds[0] > east || row.bounds[3] < south || row.bounds[1] > north) continue;
      const path = this.outlines[i];
      if (national) {
        const value = this.countryValues.get(row.id);
        ctx.globalAlpha = Number.isFinite(value) ? .84 : .60;
        ctx.fillStyle = colorFor(this.lens, value, ...this.range);
        ctx.fill(path, 'evenodd');
      }
      ctx.globalAlpha = 1;
      ctx.stroke(path);
    }
  }

  drawCells(tiles, west, south, east, north) {
    const { ctx, lens, options, level, camera: { scale } } = this;
    const thematic = lens && !lens.code && lens.id !== 'terrain';
    if (!options.grid && !thematic) return;
    const margin = level === 2 ? 7 : level === 3 ? 3.5 : 1.8;
    const polar = level === 2 ? 78 : level === 3 ? 84 : 88;
    const paths = new Map();
    const linework = new Path2D();
    for (const { cells } of tiles) for (const cell of cells) {
      if (cell.lat < south - margin || cell.lat > north + margin) continue;
      const offset = (cell.lon < west - margin && cell.lon + 360 <= east + margin) ? 360 : (cell.lon > east + margin && cell.lon - 360 >= west - margin) ? -360 : 0;
      if (Math.abs(cell.lat) < polar && (cell.lon + offset < west - margin || cell.lon + offset > east + margin)) continue;
      const path = hexPath(cell);
      const transform = offset ? new DOMMatrix().translate(offset, 0) : undefined;
      if (options.grid) linework.addPath(path, transform);
      if (thematic) {
        let color = null;
        if (lens.id === 'biome') color = cell.land > .05 ? this.manifest.biomes[cell.biome]?.[1] : null;
        else {
          if (lens.id === 'density' && cell.density === undefined) cell.density = cellValue(cell, lens);
          const value = lens.id === 'density' ? cell.density : cellValue(cell, lens);
          if (Number.isFinite(value)) color = colorFor(lens, value, ...this.range);
        }
        if (color) {
          if (!paths.has(color)) paths.set(color, new Path2D());
          paths.get(color).addPath(path, transform);
        }
      }
    }
    ctx.globalAlpha = .78;
    for (const [color, path] of paths) { ctx.fillStyle = color; ctx.fill(path); }
    ctx.globalAlpha = 1;
    if (options.grid) {
      ctx.lineWidth = (level === 2 ? .38 : .59) / scale;
      ctx.strokeStyle = level === 2 ? '#c0ded41e' : '#c2d9cb44';
      ctx.stroke(linework);
    }
  }

  drawWater() {
    const { ctx, camera: { scale } } = this;
    ctx.lineWidth = (scale > 16 ? .9 : .55) / scale;
    ctx.strokeStyle = scale > 16 ? '#80b4bdc9' : '#8db7b78c';
    const rank = scale > 30 ? 8 : scale > 8 ? 5 : 2;
    for (const river of this.rivers) if (river.rank <= rank) ctx.stroke(river.path);
    ctx.fillStyle = this.lens?.id === 'height' ? '#5083a0bc' : '#3b6474d9';
    for (const lake of this.lakes) if (lake.rank <= rank + 1) ctx.fill(lake.path, 'evenodd');
  }

  drawGraticule() {
    const { ctx, camera: { scale } } = this;
    const [west, south, east, north] = this.bearingBounds();
    const unclippedSouth = Math.max(-90, south);
    const unclippedNorth = Math.min(90, north);
    const step = scale > 80 ? 2 : scale > 30 ? 5 : scale > 9 ? 10 : 30;
    ctx.beginPath();
    ctx.strokeStyle = '#d5ece929';
    ctx.lineWidth = .65 / scale;
    for (let x = Math.ceil(west / step) * step; x <= east; x += step) {
      ctx.moveTo(x, -unclippedSouth);
      ctx.lineTo(x, -unclippedNorth);
    }
    for (let y = Math.ceil(unclippedSouth / step) * step; y <= unclippedNorth; y += step) {
      ctx.moveTo(west, -y);
      ctx.lineTo(east, -y);
    }
    ctx.stroke();
  }

  drawSelection(offsets) {
    const { ctx, selected, camera: { scale } } = this;
    if (!selected) return;
    let path;
    if (selected.type === 'cell') path = hexPath(selected.cell);
    if (selected.type === 'country') path = this.outlines[this.manifest.countries.indexOf(selected.country)];
    if (!path) return;
    ctx.lineWidth = 2 / scale;
    ctx.strokeStyle = '#ffda99';
    ctx.fillStyle = '#f2c57f26';
    for (const offset of offsets) {
      ctx.save();
      ctx.translate(offset, 0);
      ctx.fill(path, 'evenodd');
      ctx.stroke(path);
      ctx.restore();
    }
  }

  inside(x, y, margin = 16) {
    return x > -margin && x < this.width + margin && y > -margin && y < this.height + margin;
  }

  drawLabels() {
    if (!this.options.labels) return;
    const { ctx, camera: { scale } } = this;
    const occupied = [];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (scale < 10) {
      ctx.font = '500 11px ui-monospace, "PingFang SC", sans-serif';
      ctx.fillStyle = GRID_LABEL;
      for (const [name, lat, lon] of OCEANS) {
        const [x, y] = this.screen(lat, lon);
        if (this.inside(x, y, -12)) ctx.fillText(name, x, y);
      }
    }
    ctx.font = `${scale > 12 ? '600 13px' : '600 10px'} "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.lineWidth = 2.9;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#203a3bea';
    ctx.fillStyle = '#f5f3d9';
    const maxRank = scale > 30 ? 10 : scale > 12 ? 6 : 2;
    for (const country of this.manifest.countries) {
      if (country.rank > maxRank) continue;
      const [x, y] = this.screen(country.lat, country.lon);
      if (!this.inside(x, y, -15) || occupied.some(([px, py]) => Math.abs(px - x) < 43 && Math.abs(py - y) < 14)) continue;
      occupied.push([x, y]);
      ctx.strokeText(country.zh, x, y);
      ctx.fillText(country.zh, x, y);
    }
  }

  drawPlaces() {
    const { ctx, camera: { scale }, options, selected } = this;
    const occupied = new Set();
    const cityMinimum = scale < 7 ? 2500000 : scale < 16 ? 750000 : scale < 29 ? 210000 : scale < 64 ? 55000 : 0;
    const cellSize = scale < 16 ? 26 : 22;
    const pop = (item) => item[6];
    const cityHit = (item, x, y, radius) => ({ x, y, radius, type: 'city', item });
    const coordinatesOf = (item) => this.screen(item[4], item[5]);
    for (const city of this.cities) {
      if (pop(city) < cityMinimum) break;
      const [x, y] = coordinatesOf(city);
      if (!this.inside(x, y)) continue;
      const key = `${Math.round(x / cellSize)},${Math.round(y / cellSize)}`;
      if (occupied.has(key)) continue;
      occupied.add(key);
      if (options.art && this.projection === 'flat' && scale >= 36 && this.lens?.id === 'terrain' && (pop(city) >= 160000 || scale >= 96)) {
        const size = cityGlyph(ctx, city, x, y, scale);
        if (options.labels && (pop(city) > 1500000 || scale > 100 && pop(city) > 250000)) this.placeName(city[2] || city[1], x + size*.45, y + size*.3);
        this.hits.push(cityHit(city, x, y, Math.max(8, size*.7)));
        continue;
      }
      const radius = pop(city) >= 2500000 ? 3.65 : 2.55;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.lineWidth = 1.15;
      ctx.strokeStyle = '#234249';
      ctx.fillStyle = pop(city) > 3000000 ? '#fbdb92' : '#e6c07e';
      ctx.fill();
      ctx.stroke();
      if (options.labels && (scale > 90 || scale > 18 && (pop(city) > 700000 || !!city[7]))) this.placeName(city[2] || city[1], x, y);
      this.hits.push(cityHit(city, x, y, Math.max(8, radius + 4)));
    }
    if (options.sites.size) this.drawSites(occupied, coordinatesOf);
    if (selected?.type === 'city' || selected?.type === 'site') {
      const [x, y] = coordinatesOf(selected.item);
      if (!this.inside(x, y)) return;
      ctx.beginPath();
      ctx.arc(x, y, 8.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffeead';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffeead';
      ctx.fill();
      this.placeName(selected.type === 'city' ? selected.item[2] || selected.item[1] : selected.item[2], x, y);
      this.hits.push({ x, y, radius: 11, type: selected.type, item: selected.item });
    }
  }

  placeName(name, x, y) {
    const { ctx } = this;
    ctx.font = '600 11px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#19343b';
    ctx.fillStyle = '#fff1c5';
    ctx.strokeText(name, x + 8, y - 1, 156);
    ctx.fillText(name, x + 8, y - 1, 156);
  }

  drawSites(occupied, coordinatesOf) {
    const { ctx, camera: { scale }, options } = this;
    for (const site of this.sites) {
      const [, type, , , , , size] = site;
      if (!options.sites.has(type)) continue;
      if (type === 0 && scale < 10 && size > 3 || type === 1 && scale < 12 && !size || type === 2 && size < (scale < 8 ? 3200 : scale < 25 ? 750 : scale < 70 ? 75 : 0)) continue;
      const [x, y] = coordinatesOf(site);
      if (!this.inside(x, y)) continue;
      const key = `${Math.round(x / 15)},${Math.round(y / 15)}`;
      if (occupied.has(`site-${key}`)) continue;
      occupied.add(`site-${key}`);
      if (scale > 48 && options.art && siteGlyph(ctx, type, x, y, size)) {
        this.hits.push({ x, y, radius: 10, type: 'site', item: site });
        continue;
      }
      ctx.fillStyle = SITE_COLORS[type];
      ctx.strokeStyle = '#24434c';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      if (type === 0) ctx.rect(x - 2.8, y - 2.8, 5.6, 5.6);
      else if (type === 1) { ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y + 3); ctx.lineTo(x - 4, y + 3); }
      else if (type === 3) {
        for (let i = 0; i < 10; i++) {
          const angle = Math.PI*(i/5-.5), r = i % 2 ? 2.8 : 6.2;
          const sx = x + Math.cos(angle)*r, sy = y + Math.sin(angle)*r;
          if (!i) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
      } else { ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 4, y); }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      this.hits.push({ x, y, radius: 7.5, type: 'site', item: site });
    }
  }

  markAt(x, y) {
    let closest;
    let least = Infinity;
    for (const hit of this.hits) {
      const distance = Math.hypot(x - hit.x, y - hit.y);
      if (distance <= hit.radius && distance <= least) { closest = hit; least = distance; }
    }
    return closest;
  }

  async selectAt(x, y) {
    const hit = this.markAt(x, y);
    const key = this.pick = Symbol('selection');
    const result = hit || await this.details(...this.geo(x, y));
    if (result && key === this.pick) this.onSelect(result);
  }

  hoverAt(x, y) {
    const hit = this.markAt(x, y);
    if (hit) {
      const item = hit.item;
      this.onHover(x, y, item[2] || item[1], hit.type === 'city' ? format(item[6], '人', true) : coordinates(item[4], item[5]));
      return;
    }
    const [lat, lon] = this.geo(x, y);
    const cell = this.placeCell(this.level, lat, lon)?.cell;
    if (!cell) { this.onHover(); return; }
    const country = this.manifest.countries[cell.region - 1];
    this.onHover(x, y, country?.zh || (cell.land ? '陆地' : '海洋'), `${Math.round(TILE_KM[this.level])} km 边长 · ${coordinates(lat, lon)}`);
  }

  attachInput() {
    const { canvas, pointers } = this;
    const at = (e) => {
      const rect = canvas.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top];
    };
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom(Math.exp(-clamp(e.deltaY * (e.deltaMode === 1 ? 13 : 1), -200, 200) * .0028), ...at(e));
    }, { passive: false });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, at(e));
      if (pointers.size === 1) this.moved = 0;
      else this.moved = 10;
      canvas.classList.add('dragging');
      this.onHover();
    });
    canvas.addEventListener('pointermove', (e) => {
      const next = at(e);
      const last = pointers.get(e.pointerId);
      if (!last) { if (e.pointerType === 'mouse') this.hoverAt(...next); return; }
      pointers.set(e.pointerId, next);
      const dx = next[0] - last[0];
      const dy = next[1] - last[1];
      this.moved += Math.hypot(dx, dy);
      if (pointers.size === 1) this.pan(dx, dy);
      else {
        const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)?.[1];
        const before = Math.hypot(other[0] - last[0], other[1] - last[1]);
        const after = Math.hypot(other[0] - next[0], other[1] - next[1]);
        this.pan(dx / 2, dy / 2);
        if (before > 4 && after > 4) this.zoom(after / before, (other[0] + next[0]) / 2, (other[1] + next[1]) / 2);
      }
    });
    const release = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (!pointers.size) { canvas.classList.remove('dragging'); this.repaint(); }
      if (this.moved < 5 && e.type === 'pointerup') void this.selectAt(...at(e));
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerleave', () => this.onHover());
    canvas.addEventListener('dblclick', (e) => this.zoom(2.3, ...at(e)));
    canvas.addEventListener('keydown', (e) => {
      const action = {
        ArrowLeft: () => this.pan(90, 0), ArrowRight: () => this.pan(-90, 0),
        ArrowUp: () => this.pan(0, 90), ArrowDown: () => this.pan(0, -90),
        '+': () => this.zoom(1.45), '=': () => this.zoom(1.45), '-': () => this.zoom(1 / 1.45),
        Home: () => this.world(), Enter: () => void this.selectAt(this.width / 2, this.height / 2),
      }[e.key];
      if (action) { e.preventDefault(); action(); }
    });
  }
}
