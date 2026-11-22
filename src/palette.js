const linear = Float64Array.from({ length: 256 }, (_, value) => {
  const s = value / 255;
  return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
});
const channels = color => [color >>> 16, color >>> 8 & 255, color & 255];
const pack = (r, g, b) => r << 16 | g << 8 | b;
const rgbAt = (data, i) => pack(data[i], data[i + 1], data[i + 2]);
export const MAX_COLORS = 64;
export const colorHex = color => '#' + color.toString(16).padStart(6, '0').toUpperCase();

export function parsePalette(value) {
  const values = value.trim().split(/[\s,;，；]+/u).filter(Boolean);
  if (!values.length || values.some(color => !/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(color))) return null;
  const parsed = values.map(hex => {
    const value = hex.slice(1);
    return Number.parseInt(value.length === 3 ? [...value].map(c => c + c).join('') : value, 16);
  });
  const distinct = [...new Set(parsed)];
  return distinct.length <= MAX_COLORS ? distinct : null;
}

function toLab(rgb) {
  const r = linear[rgb >>> 16], g = linear[rgb >>> 8 & 255], b = linear[rgb & 255];
  // Linear sRGB to Oklab (Björn Ottosson).
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return [
    .2104542553 * l + .7936177850 * m - .0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + .4505937099 * s,
    .0259040371 * l + .7827717662 * m - .8086757660 * s
  ];
}
const distance = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

function prepareAlpha(data, { transparent, matte }) {
  let hasMatte = false;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (transparent) {
      if (alpha < 128) data.fill(0, i, i + 4);
      else data[i + 3] = 255;
    } else if (alpha < 255) {
      for (let c = 0; c < 3; c++) data[i + c] = Math.round((data[i + c] * alpha + matte[c] * (255 - alpha)) / 255);
      data[i + 3] = 255;
      if (!alpha) hasMatte = true;
    }
  }
  return hasMatte;
}

function exactHistogram(data, reserved) {
  const counts = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const rgb = rgbAt(data, i);
    if (reserved.includes(rgb)) continue;
    counts.set(rgb, (counts.get(rgb) || 0) + 1);
    if (counts.size > 32768) return null;
  }
  return [...counts].map(([rgb, weight]) => ({ rgb, lab: toLab(rgb), weight }));
}

// Fall back to at most 32K bins for photos with millions of distinct colors.
function coarseHistogram(data, reserved) {
  const bins = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const rgb = rgbAt(data, i);
    if (reserved.includes(rgb)) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = (r >> 3) << 10 | (g >> 3) << 5 | b >> 3;
    const bin = bins.get(key);
    if (bin) {
      bin.weight++;
      bin.r += r; bin.g += g; bin.b += b;
    } else {
      bins.set(key, { weight: 1, r, g, b });
    }
  }
  return [...bins.values()].map(({ weight, r, g, b }) => {
    const rgb = pack(Math.round(r / weight), Math.round(g / weight), Math.round(b / weight));
    return { rgb, lab: toLab(rgb), weight };
  });
}

function colorBox(entries) {
  const sums = [0, 0, 0], squares = [0, 0, 0];
  let weight = 0;
  for (const point of entries) {
    weight += point.weight;
    for (let axis = 0; axis < 3; axis++) {
      sums[axis] += point.lab[axis] * point.weight;
      squares[axis] += point.lab[axis] ** 2 * point.weight;
    }
  }
  const center = sums.map(sum => sum / weight);
  const spread = squares.map((sum, i) => sum - sums[i] * center[i]);
  const score = entries.length > 1 ? Math.max(...spread) : -1;
  return { entries, center, weight, score, axis: spread.indexOf(score) };
}

function splitPalette(entries, count) {
  if (!entries.length) return [];
  const boxes = [colorBox(entries)];
  while (boxes.length < count) {
    let best = 0;
    for (let i = 1; i < boxes.length; i++) if (boxes[i].score > boxes[best].score) best = i;
    const { entries, score, axis, weight } = boxes[best];
    if (score <= 0) break;
    entries.sort((a, b) => a.lab[axis] - b.lab[axis]);
    let used = 0, split = 1;
    while (split < entries.length) {
      used += entries[split - 1].weight;
      if (used >= weight / 2 || split === entries.length - 1) break;
      split++;
    }
    boxes.splice(best, 1, colorBox(entries.slice(0, split)), colorBox(entries.slice(split)));
  }
  return boxes.map(({ center, entries }) => {
    let best = entries[0], smallest = Infinity;
    for (const entry of entries) {
      const delta = distance(center, entry.lab);
      if (delta < smallest) { smallest = delta; best = entry; }
    }
    return best.rgb;
  });
}

function automaticColors(data, { limit, ink, matte }, hasMatte) {
  const exact = new Set();
  const inkRgb = ink ? pack(...ink) : -1;
  let hasInk = false;
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const color = rgbAt(data, i);
    if (exact.size <= limit) exact.add(color);
    if (color === inkRgb) hasInk = true;
  }
  if (exact.size <= limit) return [...exact];

  const reserved = [];
  if (hasInk && limit >= 2) reserved.push(inkRgb);
  const matteRgb = pack(...matte);
  if (hasMatte && limit - reserved.length >= 2 && !reserved.includes(matteRgb)) reserved.push(matteRgb);
  const entries = exactHistogram(data, reserved) ?? coarseHistogram(data, reserved);
  return reserved.concat(splitPalette(entries, limit - reserved.length));
}

// Apply the palette after sampling and outlines. Only these opaque RGB colors can appear in the PNG.
export function applyPalette(data, options) {
  const hasMatte = prepareAlpha(data, options);
  const palette = options.mode === 'custom' ? options.colors : automaticColors(data, options, hasMatte);
  const candidates = palette.map(rgb => ({ rgb, lab: toLab(rgb) }));
  const cache = new Map(palette.map(rgb => [rgb, rgb]));
  const used = new Set();
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const rgb = rgbAt(data, i);
    let closest = cache.get(rgb);
    if (closest === undefined) {
      const lab = toLab(rgb);
      let smallest = Infinity;
      for (const candidate of candidates) {
        const delta = distance(lab, candidate.lab);
        if (delta < smallest) { closest = candidate.rgb; smallest = delta; }
      }
      if (cache.size < 65536) cache.set(rgb, closest);
    }
    data[i] = closest >>> 16;
    data[i + 1] = closest >>> 8 & 255;
    data[i + 2] = closest & 255;
    used.add(closest);
  }
  return palette.filter(rgb => used.has(rgb));
}
