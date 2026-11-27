// Orthographic overview. The texture is painted by the same cartographic layers as the flat map.
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const W = 2048;
const H = W / 2;

export class Globe {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.raster = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.dirty = true;
  }

  invalidate() { this.dirty = true; }

  geometry(map) {
    return {
      x: map.width * .5, y: map.height * .51,
      radius: Math.min(map.height * .384, map.width * .365) * map.camera.scale / map.minScale,
    };
  }

  project(map, lat, lon) {
    const { x, y, radius } = this.geometry(map);
    const phi = map.camera.lat * RAD, beta = lat * RAD, lambda = (lon - map.camera.lon) * RAD;
    const sin = Math.sin(beta), cos = Math.cos(beta), depth = cos * Math.cos(lambda);
    if (sin * Math.sin(phi) + depth * Math.cos(phi) < .015) return [Infinity, Infinity];
    return [x + radius * cos * Math.sin(lambda), y - radius * (sin * Math.cos(phi) - depth * Math.sin(phi))];
  }

  inverse(map, x, y) {
    const g = this.geometry(map);
    const a = (x - g.x) / g.radius, b = (g.y - y) / g.radius;
    const radial = 1 - a * a - b * b;
    if (radial < 0) return [NaN, NaN];
    const z = Math.sqrt(radial), phi = map.camera.lat * RAD;
    return [Math.asin(Math.max(-1, Math.min(1, b * Math.cos(phi) + z * Math.sin(phi)))) * DEG,
      ((map.camera.lon + Math.atan2(a, z * Math.cos(phi) - b * Math.sin(phi)) * DEG + 540) % 360) - 180];
  }

  texture(map) {
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    const scale = W / 360;
    const painter = Object.create(map);
    painter.ctx = ctx;
    painter.camera = { lon: 0, lat: 0, scale };
    painter.level = 2;
    ctx.setTransform(scale, 0, 0, scale, W / 2, H / 2);
    ctx.fillStyle = '#355f6d';
    ctx.fillRect(-180, -90, 360, 180);
    if (map.relief.complete && map.relief.naturalWidth) ctx.drawImage(map.relief, -180, -90, 360, 180);
    painter.drawCountries(-180, -90, 180, 90);
    const world = map.data.get('2/world');
    if (world) painter.drawCells([world], -180, -90, 180, 90);
    painter.drawWater();
    ctx.beginPath();
    ctx.lineWidth = .09;
    ctx.strokeStyle = '#d6e6d941';
    for (let lat = -75; lat < 90; lat += 15) { ctx.moveTo(-180, -lat); ctx.lineTo(180, -lat); }
    for (let lon = -180; lon < 180; lon += 15) { ctx.moveTo(lon, -90); ctx.lineTo(lon, 90); }
    ctx.stroke();
    this.pixels = ctx.getImageData(0, 0, W, H).data;
    this.dirty = false;
    this.frameKey = null;
  }

  draw(map) {
    const { ctx, width, height, camera, dpr } = map;
    const { x, y, radius } = this.geometry(map);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createRadialGradient(x - radius * .3, y - radius * .35, radius * .3, x, y, Math.max(radius * 2.5, width * .8));
    bg.addColorStop(0, '#345d64'); bg.addColorStop(.62, '#244853'); bg.addColorStop(1, '#16343f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    this.surround(ctx, x, y, radius, width, height);
    if (this.dirty || !this.pixels) this.texture(map);
    const dragging = map.pointers.size > 0;
    const diameter = Math.max(32, Math.min(dragging ? 430 : 1120, Math.round(radius * 2 * (dragging ? .72 : Math.min(1.45, dpr)))));
    const key = [diameter, camera.lat, camera.lon].join('/');
    if (key !== this.frameKey) {
      this.shadeSphere(diameter, camera.lat, camera.lon);
      this.frameKey = key;
    }
    ctx.drawImage(this.raster, x - radius, y - radius, radius * 2, radius * 2);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#b2d6cf9c';
    ctx.beginPath(); ctx.arc(x, y, radius, 0, 2*Math.PI); ctx.stroke();
    map.hits = [];
    map.drawLabels();
    map.drawPlaces();
    if (map.selected?.type === 'cell') {
      const { lat, lon } = map.selected.cell;
      const [sx, sy] = this.project(map, lat, lon);
      if (Number.isFinite(sx)) {
        ctx.strokeStyle = '#ffeab0'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx, sy, 8, 0, 2*Math.PI); ctx.stroke();
      }
    }
  }

  surround(ctx, x, y, r, width, height) {
    ctx.lineWidth = 1;
    const rings = [1.105, 1.129, 1.49];
    for (const [i, ring] of rings.entries()) {
      ctx.beginPath(); ctx.strokeStyle = i === 0 ? '#b5d4c944' : '#afccbf13';
      ctx.arc(x, y, r * ring, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.strokeStyle = '#b1cdbb62';
    ctx.beginPath();
    for (let i = 0; i < 360; i += 2) {
      const a = i * RAD, outer = r*1.105, inner = outer - (i % 30 === 0 ? 7 : i % 10 === 0 ? 4.5 : 2);
      ctx.moveTo(x + Math.cos(a)*inner, y + Math.sin(a)*inner);
      ctx.lineTo(x + Math.cos(a)*outer, y + Math.sin(a)*outer);
    }
    ctx.stroke();
    ctx.save();
    ctx.setLineDash([2, 6]); ctx.strokeStyle = '#b1cdbb30';
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(x-r*1.13,y); ctx.moveTo(x+r*1.13,y); ctx.lineTo(width,y);
    ctx.moveTo(x, 0); ctx.lineTo(x,y-r*1.13); ctx.moveTo(x,y+r*1.13); ctx.lineTo(x,height);ctx.stroke();
    ctx.restore();
    if (r > Math.min(width, height)*.52) return;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';ctx.fillStyle = '#c7d7c5';ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('N',x,y-r*1.15-4); ctx.fillText('S',x,y+r*1.15+4);
  }

  shadeSphere(diameter, lat, lon) {
    if (this.raster.width !== diameter || this.raster.height !== diameter) {
      this.raster.width = diameter; this.raster.height = diameter;
      const { data } = this.image = this.raster.getContext('2d').createImageData(diameter, diameter);
      this.normals = [];
      const radius = diameter / 2;
      for (let row = 0; row < diameter; row++) {
        const b = (radius - row - .5) / radius;
        const half = Math.sqrt(1 - b*b);
        const start = Math.max(0, Math.ceil(radius * (1-half) - .5));
        const end = Math.min(diameter, Math.floor(radius*(1+half) - .5) + 1);
        const z = new Float32Array(end - start);
        const light = new Float32Array(end - start);
        for (let col = start; col < end; col++) {
          const a = (col+.5-radius)/radius;
          z[col-start] = Math.sqrt(Math.max(0, 1 - b*b - a*a));
          light[col-start] = .78 + .25 * z[col-start] + .09*b - .07*a;
          data[4*(row*diameter+col)+3] = 255;
        }
        this.normals.push({ b, start, end, z, light });
      }
    }
    const pixels = this.image.data, texture = this.pixels;
    const phi = lat * RAD, sin = Math.sin(phi), cos = Math.cos(phi), half = diameter/2;
    for (let row=0; row<diameter; row++) {
      const { b, start, end, z, light } = this.normals[row];
      for (let col=start; col<end; col++) {
        const i=col-start, depth=z[i], a=(col+.5-half)/half;
        const u = (W + (lon/360 + .5 + Math.atan2(a, depth*cos-b*sin)/(2*Math.PI))*W) % W;
        const v = Math.min(H-1, Math.max(0, Math.floor((.5-Math.asin(Math.min(1,Math.max(-1,b*cos+depth*sin)))/Math.PI)*H)));
        const src = 4 * (v*W + Math.floor(u));
        const target = 4 * (row*diameter+col);
        const rim = Math.max(0, .18-depth) * 42;
        pixels[target] = texture[src]*light[i] + rim;
        pixels[target+1] = texture[src+1]*light[i] + rim*1.5;
        pixels[target+2] = texture[src+2]*light[i] + rim*1.8;
      }
    }
    this.raster.getContext('2d').putImageData(this.image,0,0);
  }
}
