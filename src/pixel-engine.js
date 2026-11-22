import { applyPalette } from './palette.js';
import { flattenSmoothRegions } from './flat-colors.js';

const clamp = (x, min, max) => Math.min(max, Math.max(min, x));
const luma = (r, g, b) => (54 * r + 183 * g + 19 * b) / 256;

// Luminance plus two color-opponent axes pick up edges between equally bright hues.
function colorDistance(r, g, b, rr, gg, bb) {
  const dr = r - rr, dg = g - gg, db = b - bb;
  return Math.abs(luma(dr, dg, db)) + .24 * Math.abs(dr - dg) + .16 * Math.abs(db - dg);
}
const linear = Float32Array.from({ length: 256 }, (_, i) => {
  const value = i / 255;
  return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
});
const gamma = Float32Array.from({ length: 8193 }, (_, i) => {
  const value = i / 8192;
  return 255 * (value <= .0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - .055);
});
const encode = value => gamma[Math.round(clamp(value, 0, 1) * 8192)];

function writeLinear(target, at, r, g, b, alpha) {
  if (alpha <= .5 / 255) return;
  target[at] = encode(r / alpha);
  target[at + 1] = encode(g / alpha);
  target[at + 2] = encode(b / alpha);
  target[at + 3] = clamp(alpha, 0, 1) * 255;
}

function sinc(x) {
  if (Math.abs(x) < 1e-7) return 1;
  return Math.sin(Math.PI * x) / (Math.PI * x);
}
function lanczosTaps(count, samples) {
  return Array.from({ length: count }, (_, i) => {
    const center = (i + .5) * samples - .5;
    const start = Math.max(0, Math.ceil(center - 3 * samples));
    const end = Math.min(count * samples - 1, Math.floor(center + 3 * samples));
    const weights = Float32Array.from({ length: end - start + 1 }, (_, j) => {
      const x = (start + j - center) / samples;
      return sinc(x) * sinc(x / 3);
    });
    const sum = weights.reduce((a, b) => a + b, 0);
    return { start, weights: weights.map(w => w / sum) };
  });
}
function resizeLanczos(raw, out, width, height, samples) {
  const rowSize = width * samples * 4;
  const rowTaps = lanczosTaps(width, samples);
  const columnTaps = lanczosTaps(height, samples);
  // Cache only the horizontal rows needed by the current vertical filter window.
  const rows = new Map();
  for (let y = 0; y < height; y++) {
    const { start, weights } = columnTaps[y];
    for (const row of rows.keys()) if (row < start) rows.delete(row);
    for (let k = 0; k < weights.length; k++) {
      const sourceRow = start + k;
      if (rows.has(sourceRow)) continue;
      const row = new Float32Array(width * 4);
      for (let x = 0; x < width; x++) {
        const horizontal = rowTaps[x];
        let i = sourceRow * rowSize + horizontal.start * 4;
        const to = x * 4;
        for (const weight of horizontal.weights) {
          const alpha = raw[i + 3] / 255 * weight;
          row[to] += linear[raw[i]] * alpha;
          row[to + 1] += linear[raw[i + 1]] * alpha;
          row[to + 2] += linear[raw[i + 2]] * alpha;
          row[to + 3] += alpha;
          i += 4;
        }
      }
      rows.set(sourceRow, row);
    }
    const filtered = [...weights].map((weight, k) => ({ row: rows.get(start + k), weight }));
    for (let i = 0; i < width * 4; i += 4) {
      let r = 0, g = 0, b = 0, a = 0;
      for (const { row, weight } of filtered) {
        r += row[i] * weight;
        g += row[i + 1] * weight;
        b += row[i + 2] * weight;
        a += row[i + 3] * weight;
      }
      writeLinear(out, y * width * 4 + i, r, g, b, a);
    }
  }
}

function resizeCells(raw, out, width, height, s, mode) {
  const rowSize = width * s * 4, total = s * s;
  if (s === 1) { out.set(raw); return; }
  const bins = new Float32Array(4096);
  const representatives = new Int32Array(4096);
  const touched = new Uint16Array(total);
  const adaptive = mode === 'adaptive';
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const to = (y * width + x) * 4;
      const base = (y * s * width * s + x * s) * 4;
      if (mode === 'nearest') {
        const middle = Math.floor(s / 2);
        const from = base + middle * (rowSize + 4);
        out.set(raw.subarray(from, from + 4), to);
        continue;
      }
      let count = 0, dominant = 0, bestBin = 0, full = 0;
      let rSum = 0, gSum = 0, bSum = 0, alphaSum = 0;
      let darkCount = 0, darkAt = -1, darkScore = Infinity, minLum = 255, maxLum = 0;
      for (let v = 0; v < s; v++) {
        let at = base + v * rowSize;
        for (let u = 0; u < s; u++, at += 4) {
          const a = raw[at + 3] / 255;
          if (a === 0) continue;
          const r = raw[at], g = raw[at + 1], b = raw[at + 2];
          rSum += linear[r] * a;
          gSum += linear[g] * a;
          bSum += linear[b] * a;
          alphaSum += a;
          if (!adaptive) continue;
          if (a >= .98) full++;
          const brightness = luma(r, g, b);
          minLum = Math.min(minLum, brightness);
          maxLum = Math.max(maxLum, brightness);
          const dx = (u + .5) / s - .5, dy = (v + .5) / s - .5;
          const centerWeight = 1 - .38 * (dx * dx + dy * dy);
          const key = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
          if (!bins[key]) {
            touched[count++] = key;
            representatives[key] = at;
          }
          bins[key] += a * centerWeight;
          if (bins[key] > dominant) {
            dominant = bins[key];
            bestBin = key;
          }
          const score = brightness + 4 * (dx * dx + dy * dy);
          if (a >= .55 && brightness < 66 && Math.max(r, g, b) - Math.min(r, g, b) < 63) {
            darkCount += a * centerWeight;
            if (score < darkScore) { darkScore = score; darkAt = at; }
          }
        }
      }
      if (!adaptive) {
        writeLinear(out, to, rSum / total, gSum / total, bSum / total, alphaSum / total);
        continue;
      }
      const opaqueShape = full > 0 && alphaSum - full < total * .23;
      const representative = representatives[bestBin];
      if (darkAt >= 0 && darkCount > Math.max(1.1, total * .105)
        && (maxLum - darkScore >= 22 || (opaqueShape && alphaSum < total * .55))
        && colorDistance(raw[representative], raw[representative + 1], raw[representative + 2],
          raw[darkAt], raw[darkAt + 1], raw[darkAt + 2]) > 19) {
        out.set(raw.subarray(darkAt, darkAt + 3), to);
        out[to + 3] = 255;
      } else if (alphaSum > 0 && (!opaqueShape || alphaSum >= total * .49)) {
        if (dominant >= alphaSum * .55 || maxLum - minLum > 35 && dominant >= alphaSum * .22) {
          out.set(raw.subarray(representative, representative + 3), to);
        } else {
          out[to] = encode(rSum / alphaSum);
          out[to + 1] = encode(gSum / alphaSum);
          out[to + 2] = encode(bSum / alphaSum);
        }
        out[to + 3] = opaqueShape ? 255 : Math.round(alphaSum / total * 255);
      } else if (darkAt >= 0 && opaqueShape && darkCount > Math.max(1.1, total * .105)) {
        out.set(raw.subarray(darkAt, darkAt + 3), to);
        out[to + 3] = 255;
      }
      for (let j = 0; j < count; j++) bins[touched[j]] = 0;
    }
  }
}

function distanceAt(data, i, j) {
  return colorDistance(data[i], data[i + 1], data[i + 2], data[j], data[j + 1], data[j + 2]);
}
function visitPerimeter(w, h, callback) {
  for (let x = 0; x < w; x++) {
    callback(x);
    if (h > 1) callback((h - 1) * w + x);
  }
  for (let y = 1; y + 1 < h; y++) {
    callback(y * w);
    if (w > 1) callback(y * w + w - 1);
  }
}
function visitNeighbors(i, w, n, callback) {
  if (i % w) callback(i - 1);
  if (i % w + 1 < w) callback(i + 1);
  if (i >= w) callback(i - w);
  if (i + w < n) callback(i + w);
}
function getBackground(data, w, h, mode, flags) {
  const n = w * h;
  let alphaBorder = 0, borderLength = 0;
  visitPerimeter(w, h, i => { borderLength++; if (data[i * 4 + 3] < 64) alphaBorder++; });
  // Infer a flat matte only when three corners and most of the perimeter agree.
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, (n - 1) * 4];
  const matte = mode !== 'alpha' && w > 2 && h > 2 && alphaBorder < borderLength * .05
    ? corners.find(p => data[p + 3] >= 245 && corners.filter(q =>
        data[q + 3] >= 245 && distanceAt(data, p, q) <= 12).length >= 3) : undefined;
  if (matte === undefined) return;
  const isMatte = i => data[i * 4 + 3] >= 200 && distanceAt(data, i * 4, matte) <= 13;
  let matches = 0;
  visitPerimeter(w, h, i => { if (isMatte(i)) matches++; });
  if (matches < borderLength * .6) return;
  const queue = new Uint32Array(n);
  let read = 0, write = 0;
  const append = i => {
    if (!(flags[i] & 1) && isMatte(i)) {
      flags[i] |= 1;
      queue[write++] = i;
    }
  };
  visitPerimeter(w, h, append);
  while (read < write) visitNeighbors(queue[read++], w, n, append);
}

function addOutlines(data, w, h, settings) {
  if (settings.outline === 'off') return;
  const n = w * h;
  const flags = new Uint8Array(n);
  const { outline, ink, inkWidth, sensitivity } = settings;
  const threshold = 108 - sensitivity * .77;
  // Bit 1 is background, bit 2 is existing ink, bits 3–5 hold the new line's depth.
  getBackground(data, w, h, outline, flags);
  for (let i = 0; i < n; i++) {
    const k = i * 4, a = data[k + 3];
    if (a < 64) flags[i] |= 1;
    if (a < 100) continue;
    const r = data[k], g = data[k + 1], b = data[k + 2];
    if (luma(r, g, b) < 44 && Math.max(r, g, b) - Math.min(r, g, b) < 47
      || colorDistance(r, g, b, ...ink) < 13) flags[i] |= 2;
  }
  for (let i = 0; i < n; i++) {
    if (flags[i] & 3) continue;
    const k = i * 4;
    if (data[k + 3] < 120) continue;
    let silhouette = false, contrast = false, neighborInk = false;
    visitNeighbors(i, w, n, j => {
      if (flags[j] & 1) silhouette = true;
      if (flags[j] & 2 && !(flags[j] & 1)) neighborInk = true;
      if (outline !== 'contrast' || flags[j] & 3) return;
      const q = j * 4;
      const edge = distanceAt(data, k, q);
      if (data[q + 3] < 140 || edge < threshold) return;
      const side = luma(data[k], data[k + 1], data[k + 2]) - luma(data[q], data[q + 1], data[q + 2]);
      if (side < 0 || side === 0 && i > j) return;
      // Keep one side of a local contrast peak so seams don't become double lines.
      const next = 2 * j - i, prev = 2 * i - j;
      const valid = t => t >= 0 && t < n && (Math.abs(i - j) !== 1 || w === 1
        || Math.floor(t / w) === Math.floor(i / w));
      if ((!valid(next) || distanceAt(data, q, next * 4) <= edge)
        && (!valid(prev) || distanceAt(data, prev * 4, k) < edge)) contrast = true;
    });
    // A directly adjacent authored line suppresses new high-contrast seams.
    if (silhouette || contrast && !neighborInk) flags[i] |= 4;
  }
  for (let depth = 2; depth <= inkWidth; depth++) {
    const previous = (depth - 1) << 2;
    const active = depth << 2;
    for (let i = 0; i < n; i++) {
      if (flags[i] || data[i * 4 + 3] < 120) continue;
      visitNeighbors(i, w, n, j => { if (flags[j] === previous) flags[i] = active; });
    }
  }
  for (let i = 0; i < n; i++) {
    if (flags[i] < 4) continue;
    const k = i * 4;
    data[k] = ink[0]; data[k + 1] = ink[1]; data[k + 2] = ink[2];
  }
}
export function convert({ pixels, gw, gh, samples, method, ...settings }) {
  const result = new Uint8ClampedArray(gw * gh * 4);
  if (method === 'lanczos' && samples > 1) resizeLanczos(pixels, result, gw, gh, samples);
  else resizeCells(pixels, result, gw, gh, samples, method);
  if (settings.noGradients) flattenSmoothRegions(result, gw, gh);
  addOutlines(result, gw, gh, settings);
  return result;
}

export function convertFrame(settings) {
  const result = convert(settings);
  const colors = settings.palette ? applyPalette(result, settings.palette) : null;
  return { result, colors };
}

export function connectEngine(scope) {
  scope.onmessage = ({ data }) => {
    try {
      const { result, colors } = convertFrame(data);
      scope.postMessage({ id: data.id, result, colors }, [result.buffer]);
    } catch (error) {
      scope.postMessage({ id: data.id, error: error.message });
    }
  };
}
