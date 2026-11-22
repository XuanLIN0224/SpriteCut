import { deepEqual, equal, ok } from 'node:assert/strict';
import test from 'node:test';
import { convertFrame } from '../src/pixel-engine.js';
import { applyPalette, colorHex, parsePalette } from '../src/palette.js';

const base = {
  mode: 'limit', limit: 4, ink: null, matte: [255, 255, 255], transparent: true
};
const ramp = () => Uint8ClampedArray.from(Array.from({ length: 256 }, (_, gray) => [gray, gray, gray, 255]).flat());
function opaqueColors(data) {
  const colors = new Set();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]) colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  }
  return [...colors].sort((a, b) => a - b);
}
const sorted = colors => [...colors].sort((a, b) => a - b);

test('a smooth grayscale ramp becomes hard, monotonic bands under each limit', () => {
  for (const limit of [1, 2, 4, 16, 64]) {
    const data = ramp();
    const colors = applyPalette(data, { ...base, limit });
    equal(opaqueColors(data).length, limit);
    deepEqual(opaqueColors(data), sorted(colors));
    for (let i = 4; i < data.length; i += 4) ok(data[i - 4] <= data[i]);
  }
});

test('exact colors survive when the input fits the cap, even in the same histogram bin', () => {
  const original = new Uint8ClampedArray([199, 199, 199, 255, 198, 198, 198, 255, 255, 255, 255, 255]);
  const data = original.slice();
  equal(applyPalette(data, { ...base, limit: 3 }).length, 3);
  deepEqual(data, original);
});

test('custom palette excludes all unlisted colors, including white and composited colors', () => {
  const data = ramp();
  data[3] = 0;
  data[7] = 156;
  const options = { ...base, mode: 'custom', colors: parsePalette('#161A25, #39315F; #AF6D59'), transparent: false };
  const colors = applyPalette(data, options);
  ok(colors.length > 1);
  deepEqual(opaqueColors(data), sorted(colors));
  ok(colors.every(color => options.colors.includes(color)));
  for (let i = 3; i < data.length; i += 4) equal(data[i], 255);
});

test('transparent cells do not count and the visible edge snaps to opaque', () => {
  const data = new Uint8ClampedArray([240, 240, 240, 127, 100, 80, 80, 128]);
  const colors = applyPalette(data, { ...base, limit: 1 });
  deepEqual(colors.map(colorHex), ['#645050']);
  deepEqual([...data], [0, 0, 0, 0, 100, 80, 80, 255]);
  deepEqual(applyPalette(new Uint8ClampedArray(4), { ...base, limit: 1 }), []);
});

test('automatic color count includes and preserves a present outline when space allows', () => {
  const data = ramp();
  data.set([11, 9, 14, 255], 0);
  const colors = applyPalette(data, { ...base, limit: 3, ink: [11, 9, 14] });
  equal(colors.length, 3);
  deepEqual([...data.subarray(0, 4)], [11, 9, 14, 255]);
});

test('the frame pipeline counts applied outlines and background in the finished palette', () => {
  const pixels = new Uint8ClampedArray(7 * 7 * 4);
  for (let y = 1; y < 6; y++) for (let x = 1; x < 6; x++) {
    pixels.set([x * 31, y * 37, 70, 255], 4 * (y * 7 + x));
  }
  const ink = [11, 9, 14];
  const { result, colors } = convertFrame({
    pixels, gw: 7, gh: 7, samples: 1, method: 'nearest', outline: 'alpha', ink, inkWidth: 1,
    palette: { ...base, limit: 4, ink, transparent: false, matte: [234, 234, 234] }
  });
  equal(colors.length, 4);
  deepEqual(opaqueColors(result), sorted(colors));
  deepEqual([...result.slice(0, 4)], [234, 234, 234, 255]);
  deepEqual([...result.slice(40, 44)], [11, 9, 14, 255]);
});

test('hex input is validated, normalized and deduplicated', () => {
  deepEqual(parsePalette('#Abc， #AABBCC\n#005533; #fff')?.map(colorHex), ['#AABBCC', '#005533', '#FFFFFF']);
  for (const value of ['', 'red', '#ff', '#aabbccff', '#abcxyz']) equal(parsePalette(value), null);
  equal(parsePalette(Array.from({ length: 65 }, (_, i) => colorHex(i)).join(' ')), null);
});
