// Adaptive, semantics-aware choropleth scales.
// Values are classified with a method chosen from the distribution, then mapped
// onto a palette interpolated in OKLab so perceived lightness stays monotonic.
// References: Harrower & Brewer (2003) doi:10.1111/1467-8306.00310;
// Brewer & Pickle (2002) choropleth classing; Jenks (1967) natural breaks;
// Ottosson (2020) OKLab; Smith & van der Walt (2015) viridis.

const TAU = Math.PI * 2;

/* ---------- sRGB <-> OKLab ---------- */
function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
}
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

export function rgbToOklab([r, g, b]) {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

export function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    toSrgb(clamp01(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    toSrgb(clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    toSrgb(clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)),
  ];
}

const hex = (rgb) => `#${rgb.map((c) => Math.round(clamp01(c) * 255).toString(16).padStart(2, '0')).join('')}`;

export function interpolateOklab(stops, t) {
  const position = clamp01(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(position));
  const f = position - i;
  const a = rgbToOklab(hexToRgb(stops[i]));
  const b = rgbToOklab(hexToRgb(stops[i + 1]));
  return hex(oklabToRgb([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]));
}

/* ---------- palettes: semantics first, perceived lightness monotonic ---------- */
export const PALETTES = Object.freeze({
  magnitude: { type: 'sequential', stops: ['#fff8e6', '#f6dd9a', '#e0a85a', '#a9682f', '#5f3317'] },
  plum: { type: 'sequential', stops: ['#f6eef7', '#e3c3e8', '#c084c9', '#8a4a9e', '#4a1e63'] },
  lagoon: { type: 'sequential', stops: ['#eef8f8', '#bfe6e3', '#79bfc2', '#3a8596', '#153f57'] },
  indigo: { type: 'sequential', stops: ['#f0f1fa', '#c9c9ee', '#9096d2', '#555ca0', '#252a5e'] },
  terra: { type: 'sequential', stops: ['#f4f6e7', '#d7e3ae', '#a3c47e', '#5f955f', '#2b5038'] },
  lilac: { type: 'sequential', stops: ['#fbf0f4', '#f0c6d6', '#d98aa6', '#a94f74', '#5c2342'] },
  solar: { type: 'sequential', stops: ['#fff8e6', '#ffe08a', '#f6b13f', '#d97706', '#8a3b0a'] },
  ember: { type: 'sequential', stops: ['#fdf1e3', '#f9c98e', '#ee8b52', '#c24c35', '#6d1e24'] },
  balance: { type: 'diverging', stops: ['#8c2d3f', '#c4675a', '#e9c9a8', '#f7f3e4', '#a9d3c4', '#5aa79b', '#1f6b6b'] },
  hypso: { type: 'sequential', stops: ['#0b2942', '#1d5a7a', '#3f8f96', '#7fae8a', '#b9b58a', '#e7dcc0', '#f8f4e8'] },
});
const FALLBACK_COLOR = '#687b7b';

const PALETTE_BY_ID = {
  gridPop: 'plum', density: 'plum', height: 'hypso', biome: 'biome',
  pop: 'plum', urban: 'plum', working: 'plum', elderly: 'plum', female: 'plum', fertility: 'lilac',
  gdp: 'magnitude', gdpReal: 'magnitude', income: 'magnitude', grain: 'magnitude', manufacture: 'magnitude',
  growth: 'balance',
  industry: 'indigo', services: 'indigo', agriculture: 'indigo', trade: 'indigo', unemployment: 'indigo',
  life: 'lagoon', water: 'lagoon',
  school: 'lilac', health: 'lilac', research: 'lilac', net: 'lagoon',
  electric: 'solar', renew: 'terra', energy: 'solar',
  co2: 'ember', forest: 'terra', cropland: 'terra',
};
const FALLBACK_BY_SCALE = { diverging: 'balance', total: 'magnitude', percent: 'lagoon', linear: 'indigo', height: 'hypso' };

export function paletteFor(lens) {
  if (!lens) return PALETTES.magnitude;
  if (lens.palette && PALETTES[lens.palette]) return PALETTES[lens.palette];
  const id = PALETTE_BY_ID[lens.id] || FALLBACK_BY_SCALE[lens.scale] || (lens.code ? 'lagoon' : 'plum');
  return PALETTES[id] || PALETTES.magnitude;
}
export function paletteIdFor(lens) {
  return Object.entries(PALETTES).find(([, p]) => p === paletteFor(lens))?.[0] ?? 'magnitude';
}

/* ---------- statistics ---------- */
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
export function quantile(sorted, p) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * clamp01(p);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
function mean(xs) { return xs.reduce((a, b) => a + b, 0) / (xs.length || 1); }
function stdev(xs) { const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length || 1)); }
export function skewness(xs) {
  if (xs.length < 3) return 0;
  const sd = stdev(xs);
  if (!sd) return 0;
  const m = mean(xs);
  return xs.reduce((a, b) => a + ((b - m) / sd) ** 3, 0) / xs.length;
}
function significant(value, digits = 3) {
  if (!Number.isFinite(value) || value === 0) return value;
  const scale = 10 ** (digits - 1 - Math.floor(Math.log10(Math.abs(value))));
  return Math.round(value * scale) / scale;
}
function sampleSorted(values, limit = 600) {
  const sorted = values.filter(finite).sort((a, b) => a - b);
  if (sorted.length <= limit) return sorted;
  const step = sorted.length / limit;
  const out = new Array(limit);
  for (let i = 0; i < limit; i++) out[i] = sorted[Math.floor(i * step)];
  out.push(sorted[sorted.length - 1]);
  return out;
}

/* ---------- natural breaks (Fisher-Jenks, O(k n^2), n is sampled) ---------- */
export function jenksBreaks(sorted, classes) {
  const n = sorted.length;
  const k = Math.max(1, Math.min(classes, n));
  if (k === 1) return [sorted[0], sorted[n - 1]];
  const cost = Array.from({ length: n + 1 }, () => new Float64Array(k + 1).fill(Infinity));
  const prev = Array.from({ length: n + 1 }, () => new Int32Array(k + 1));
  cost[0][0] = 0;
  for (let j = 1; j <= k; j++) {
    for (let i = 1; i <= n; i++) {
      if (i < j) continue;
      let sum = 0, sumSq = 0;
      for (let m = i; m >= j; m--) {
        const value = sorted[m - 1];
        sum += value; sumSq += value * value;
        const w = i - m + 1;
        const sse = sumSq - (sum * sum) / w;
        const total = cost[m - 1][j - 1] + Math.max(0, sse);
        if (total < cost[i][j]) { cost[i][j] = total; prev[i][j] = m; }
      }
    }
  }
  const breaks = new Array(k + 1);
  let i = n;
  for (let j = k; j >= 1; j--) {
    breaks[j] = sorted[i - 1];
    i = prev[i][j] - 1;
  }
  breaks[0] = sorted[0];
  return breaks;
}

/* ---------- classification core ---------- */
function equalBreaks(lo, hi, k) {
  return Array.from({ length: k + 1 }, (_, i) => lo + ((hi - lo) * i) / k);
}

function buildEdges(method, sorted, k, domain, transform) {
  const forward = transform === 'log' ? (v) => Math.log1p(v - domain[0]) : (v) => v;
  const inverse = transform === 'log' ? (t) => domain[0] + Math.expm1(t) : (t) => t;
  const tLo = forward(domain[0]);
  const tHi = forward(domain[1]);
  let edges;
  if (method === 'jenks') {
    edges = jenksBreaks(sorted.map(forward), k);
  } else if (method === 'quantile') {
    const steps = sorted.map(forward);
    edges = Array.from({ length: k + 1 }, (_, i) => quantile(steps, i / k));
  } else {
    edges = equalBreaks(tLo, tHi, k);
  }
  edges = edges.map(inverse);
  edges[0] = Math.min(edges[0], domain[0]);
  edges[edges.length - 1] = Math.max(edges[edges.length - 1], domain[1]);
  return edges;
}

function colorForClasses(palette, k) {
  const { type, stops } = palette;
  if (type === 'diverging') {
    // Symmetric palette: class centres sample the full stop range.
    return Array.from({ length: k }, (_, i) => interpolateOklab(stops, k === 1 ? 0.5 : i / (k - 1)));
  }
  // Sequential palettes sample class centres so the lightest class is not pure white.
  return Array.from({ length: k }, (_, i) => interpolateOklab(stops, k === 1 ? 0.5 : (i + 0.5) / k));
}

function uniqueSorted(edges, maxClasses) {
  const out = [edges[0]];
  for (let i = 1; i < edges.length; i++) {
    if (edges[i] > out[out.length - 1] || i === edges.length - 1) out.push(Math.max(edges[i], out[out.length - 1]));
  }
  const clean = [];
  for (const e of out) {
    const rounded = significant(e);
    if (!clean.length || rounded > clean[clean.length - 1]) clean.push(rounded);
  }
  if (clean.length < 2) clean.push(significant(edges[edges.length - 1]) || 1);
  while (clean.length - 1 > maxClasses) clean.splice(clean.length - 2, 1);
  return clean;
}

function decideMethod(sorted, lens, options) {
  if (options.method) return options.method;
  const values = sorted;
  const n = values.length;
  const p2 = quantile(values, 0.02), p50 = quantile(values, 0.5), p98 = quantile(values, 0.98);
  const min = values[0], max = values[n - 1];
  const negative = min < 0, positive = max > 0;
  if (lens?.scale === 'height') return 'fixed';
  if (lens?.scale === 'diverging' || (negative && positive && Math.abs(min) > 1e-9)) return 'diverging';
  if (lens?.scale === 'percent') {
    const span = (p98 - p2) / (lens.max != null ? lens.max - Math.min(0, lens.min ?? 0) : 100);
    return span < 0.35 ? 'percentQuantile' : 'percentEqual';
  }
  const spread = Math.abs(p98 - p2);
  const iqr = Math.max(1e-9, quantile(values, 0.75) - quantile(values, 0.25));
  // Heavy tail: the 2-98% range dwarfs the IQR, or the top of the range is an order
  // of magnitude above the median. Such data is classified in log space.
  const heavy = spread > 0 && (spread / iqr > 12 || (min >= 0 && p98 / Math.max(Math.abs(p50), 1e-9) > 10));
  if (heavy && min >= -1e-9) return options.preferQuantile ? 'logQuantile' : (options.preferJenks ? 'logJenks' : 'logEqual');
  if (Math.abs(skewness(values)) > 1.2) return options.preferQuantile ? 'quantile' : 'jenks';
  return 'equal';
}

function classCount(sorted, lens, method) {
  if (lens?.scale === 'height') return 7;
  if (method === 'diverging') return 7;
  if (method === 'percentEqual' || method === 'percentQuantile') return 5;
  const n = sorted.length;
  if (n < 12) return Math.max(3, Math.min(5, n - 1));
  const iqr = quantile(sorted, 0.75) - quantile(sorted, 0.25);
  if (!iqr) return 5;
  const range = sorted[sorted.length - 1] - sorted[0];
  const fd = Math.ceil(range / (2 * iqr / Math.cbrt(n)));
  return Math.min(7, Math.max(4, fd));
}

/**
 * Build a classifier for one metric and one value set.
 * @returns {object} {method, transform, breaks, colors, entries, classify, colorOf, palette, ...}
 */
export function buildScale(values, lens, options = {}) {
  // Zero-inflated non-negative data (uninhabited land, zero output) gets its own
  // explicit class instead of a numerically meaningless first interval.
  if (options.zeroClass && !options.suppressZero) {
    const finiteValues = values.filter(finite);
    const zeros = finiteValues.filter((v) => v === 0).length;
    if (zeros > 8 && zeros / finiteValues.length > 0.08) {
      const positive = finiteValues.filter((v) => v > 0);
      if (positive.length > 20) {
        const base = buildScale(positive, lens, { ...options, zeroClass: false, suppressZero: true });
        if (base.method !== 'empty') {
          const zeroColor = base.paletteStops?.[0] ?? '#eef0e6';
          const colors = [zeroColor, ...base.colors];
          const classify = (value) => {
            if (!finite(value)) return -1;
            if (value === 0) return 0;
            if (value < 0) return 0;
            return 1 + base.classify(value);
          };
          const entries = [
            { color: zeroColor, from: 0, to: base.breaks[1] ?? 1, count: zeros, zero: true, last: false },
            ...base.entries.map((e) => ({ ...e, count: e.count })),
          ];
          const counts = entries.map((e) => e.count);
          return {
            ...base, colors, entries, counts, classify,
            colorOf: (v) => { const c = classify(v); return c < 0 ? FALLBACK_COLOR : colors[c]; },
            breaks: [0, ...base.breaks],
            domain: [0, base.domain[1]],
            total: counts.reduce((a, b) => a + b, 0),
            missing: finiteValues.length - counts.reduce((a, b) => a + b, 0),
            hasZeroClass: true,
          };
        }
      }
    }
  }
  const sorted = sampleSorted(values, options.sampleLimit ?? 600);
  const palette = options.palette ?? paletteFor(lens);
  if (!sorted.length) {
    return { method: 'empty', transform: 'none', breaks: [0, 1], colors: [FALLBACK_COLOR], entries: [], classify: () => -1, colorOf: () => FALLBACK_COLOR, palette: 'missing', lens, missingColor: FALLBACK_COLOR, domain: [0, 1] };
  }
  let method = decideMethod(sorted, lens, options);
  let domain;
  if (method === 'diverging') {
    // Use the central 80% so a few extreme outliers do not wash out the map;
    // values beyond the bound saturate in the darkest classes.
    const bound = Math.max(1e-9, Math.abs(quantile(sorted, 0.1)), Math.abs(quantile(sorted, 0.9)));
    const maxAbs = Math.max(bound, Math.abs(sorted[0]) * 0.02, Math.abs(sorted[sorted.length - 1]) * 0.02);
    domain = [-maxAbs, maxAbs];
  } else if (method === 'fixed' || method === 'percentEqual' || method === 'percentQuantile') {
    domain = lens?.min != null ? [lens.min, lens.max] : [0, 100];
  } else {
    const lo = quantile(sorted, 0.02);
    const hi = quantile(sorted, 0.98);
    domain = lo === hi ? [lo, lo + Math.max(1, Math.abs(lo) * 0.1)] : [lo, hi];
  }
  let k = options.classes ?? classCount(sorted, lens, method);
  let transform = method.startsWith('log') ? 'log' : 'none';
  const base = method.replace(/^(log|percent)/, '').toLowerCase() || 'equal';
  const kind = method.startsWith('percent') ? (method.endsWith('Quantile') ? 'quantile' : 'equal') :
    method.startsWith('log') ? base : method;
  if (method === 'diverging') {
    const edges = Array.from({ length: k + 1 }, (_, i) => domain[0] + ((domain[1] - domain[0]) * i) / k);
    const colors = colorForClasses(palette, k);
    return finalize(edges, colors, domain, method, transform, lens, values, palette);
  }
  if (method === 'fixed') {
    const fixedEdges = lens?.breaks ?? [-9500, -4000, -1000, 0, 400, 1600, 3600, 6500];
    const colors = colorForClasses(palette, fixedEdges.length - 1);
    return finalize(fixedEdges, colors, [fixedEdges[0], fixedEdges[fixedEdges.length - 1]], 'fixed', transform, lens, values, palette);
  }
  // log transform with non-negative values; classify in log space.
  let edges;
  if (transform === 'log' && domain[0] < 0) { transform = 'none'; }
  try {
    edges = buildEdges(kind, sorted.filter((v) => v >= domain[0]), k, domain, transform);
  } catch {
    edges = equalBreaks(domain[0], domain[1], k);
  }
  let clean = uniqueSorted(edges, 7);
  if (clean.length < 2) clean = [domain[0], domain[1] <= domain[0] ? domain[0] + 1 : domain[1]];
  const colors = colorForClasses(palette, clean.length - 1);
  return finalize(clean, colors, domain, method, transform, lens, values, palette);
}

function finalize(edges, colors, domain, method, transform, lens, values, palette) {
  const breaks = edges.length === colors.length + 1 ? edges : uniqueSorted(edges, colors.length);
  const k = breaks.length - 1;
  const classColors = colors.slice(0, k);
  const classify = (value) => {
    if (!finite(value)) return -1;
    let lo = 0, hi = k - 1;
    if (value < breaks[1]) return 0;
    if (value >= breaks[k]) return k - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (value < breaks[mid + 1]) {
        if (value >= breaks[mid]) return mid;
        hi = mid - 1;
      } else lo = mid + 1;
    }
    return k - 1;
  };
  const counts = new Array(k).fill(0);
  for (const v of values) { const c = classify(v); if (c >= 0) counts[c]++; }
  const entries = classColors.map((color, i) => ({ color, from: breaks[i], to: breaks[i + 1], count: counts[i], last: i === k - 1 }));
  return {
    lens, palette: paletteIdFor(lens), paletteStops: palette.stops, method, transform, domain, breaks,
    colors: classColors, entries, counts, total: counts.reduce((a, b) => a + b, 0),
    classify, colorOf: (v) => { const c = classify(v); return c < 0 ? FALLBACK_COLOR : classColors[c]; },
    missingColor: FALLBACK_COLOR, missing: values.length - counts.reduce((a, b) => a + b, 0),
  };
}

/* ---------- preset domain scales ---------- */
export const FIXED_SCALES = Object.freeze({
  height: { breaks: [-9500, -4000, -1000, 0, 500, 2000, 4000, 6500], palette: 'hypso', method: 'fixed' },
});
