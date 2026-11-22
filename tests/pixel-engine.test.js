import { deepEqual, equal, ok } from 'node:assert/strict';
import test from 'node:test';
import { connectEngine, convert } from '../src/pixel-engine.js';

const alpha = [0, 0, 0, 0];
const fill = [211, 136, 200, 255];
const sourceInk = [8, 8, 8, 255];
const autoInk = [11, 9, 14, 255];
const gray = [221, 221, 221, 255];
const options = {
  gw: 32, gh: 25, samples: 8, method: 'adaptive',
  outline: 'off', ink: autoInk.slice(0, 3), inkWidth: 1, sensitivity: 46
};

function createSamples(draw) {
  const { gw, gh, samples } = options;
  const pixels = new Uint8ClampedArray(gw * gh * samples * samples * 4);
  for (let y = 0; y < gh * samples; y++) {
    for (let x = 0; x < gw * samples; x++) {
      pixels.set(draw(Math.floor(x / samples), Math.floor(y / samples), x % samples, y % samples),
        (y * gw * samples + x) * 4);
    }
  }
  return pixels;
}
const drawing = background => createSamples((x, y, _, dy) => {
  if (x < 6 || x > 25 || y < 4 || y > 19) return background;
  return y === 12 && x >= 11 && x <= 20 && dy <= 1 ? sourceInk : fill;
});
function cell(bytes, x, y) {
  const start = 4 * (y * options.gw + x);
  return [...bytes.subarray(start, start + 4)];
}

test('adaptive keeps a flat fill and a thin line away from the center sample', () => {
  const pixels = drawing(alpha);
  const adaptive = convert({ ...options, pixels });
  const nearest = convert({ ...options, pixels, method: 'nearest' });
  deepEqual(cell(adaptive, 15, 12), sourceInk);
  deepEqual(cell(adaptive, 15, 8), fill);
  deepEqual(cell(nearest, 15, 12), fill);
});

test('outline follows transparency and keeps authored ink', () => {
  const pixels = drawing(alpha);
  const out = convert({ ...options, pixels, outline: 'alpha' });
  deepEqual(cell(out, 0, 0), alpha);
  deepEqual(cell(out, 6, 8), autoInk);
  deepEqual(cell(out, 7, 8), fill);
  deepEqual(cell(out, 15, 12), sourceInk);
  const wide = convert({ ...options, pixels, outline: 'alpha', inkWidth: 2 });
  deepEqual(cell(wide, 7, 8), autoInk);
  deepEqual(cell(wide, 8, 8), fill);
});

test('auto silhouette detects a flat opaque background', () => {
  const pixels = drawing(gray);
  const outline = convert({ ...options, pixels, outline: 'outer' });
  const alphaOnly = convert({ ...options, pixels, outline: 'alpha' });
  deepEqual(cell(outline, 0, 0), gray);
  deepEqual(cell(outline, 6, 8), autoInk);
  deepEqual(cell(alphaOnly, 6, 8), fill);
});

test('contrast outline colors one side of a strong seam', () => {
  const pixels = createSamples(x => x < 20 ? [229, 220, 235, 255] : fill);
  const out = convert({ ...options, pixels, outline: 'contrast', sensitivity: 100 });
  deepEqual(cell(out, 19, 9), autoInk);
  deepEqual(cell(out, 20, 9), fill);
});

test('all four samplers keep fully transparent cells and uniform interiors', () => {
  const pixels = drawing(alpha);
  for (const method of ['adaptive', 'nearest', 'area', 'lanczos']) {
    const out = convert({ ...options, pixels, method });
    equal(out.length, options.gw * options.gh * 4);
    deepEqual(cell(out, 15, 8), fill, method);
    deepEqual(cell(out, 0, 0), alpha, method);
  }
});

test('area mixes color in linear light', () => {
  const pixels = createSamples((x, y, subX) => subX < 4 ? [255, 255, 255, 255] : sourceInk);
  const out = convert({ ...options, pixels, method: 'area' });
  ok(cell(out, 5, 5)[0] >= 187);
});

test('worker returns the matching request and transfers the output buffer', () => {
  const scope = {
    postMessage(message, transfer) {
      equal(message.id, 3);
      equal(message.error, undefined);
      deepEqual(transfer, [message.result.buffer]);
      deepEqual(cell(message.result, 15, 12), sourceInk);
    }
  };
  connectEngine(scope);
  scope.onmessage({ data: { ...options, id: 3, pixels: drawing(alpha) } });
});
