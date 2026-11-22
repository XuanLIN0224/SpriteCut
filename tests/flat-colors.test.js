import { deepEqual, equal } from 'node:assert/strict';
import test from 'node:test';
import { flattenSmoothRegions } from '../src/flat-colors.js';
import { convertFrame } from '../src/pixel-engine.js';

const rgba = (r, g = r, b = r, a = 255) => [r, g, b, a];
const fromRow = row => Uint8ClampedArray.from(row.flat());
const pixelAt = (data, x) => [...data.subarray(x * 4, x * 4 + 4)];
const distinct = data => new Set(Array.from({ length: data.length / 4 }, (_, x) => pixelAt(data, x).join(',')));

test('a smooth colored highlight ramp collapses to one original shade', () => {
  const ramp = Array.from({ length: 50 }, (_, i) => rgba(60 + 3 * i, 48 + 3 * i, 100 + 3 * i));
  const data = fromRow(ramp);
  flattenSmoothRegions(data, 50, 1);
  equal(distinct(data).size, 1);
  equal(ramp.some(color => color.join(',') === pixelAt(data, 0).join(',')), true);
});

test('short coherent ramps flatten without crossing a hard black line', () => {
  const data = fromRow([
    rgba(80, 50, 40), rgba(117, 87, 77), rgba(154, 124, 114),
    rgba(0), rgba(0),
    rgba(250, 90, 80), rgba(250, 90, 80), rgba(250, 90, 80)
  ]);
  flattenSmoothRegions(data, 8, 1);
  deepEqual(pixelAt(data, 0), pixelAt(data, 2));
  deepEqual(pixelAt(data, 3), rgba(0));
  deepEqual(pixelAt(data, 7), rgba(250, 90, 80));
  equal(distinct(data).size, 3);
});

test('a dominant fill is kept and a transparent boundary becomes crisp', () => {
  const data = fromRow([
    rgba(200, 20, 50, 10),
    rgba(200, 20, 50, 100),
    rgba(84, 120, 190, 200),
    rgba(84, 120, 190),
    rgba(84, 120, 190),
    rgba(90, 126, 195),
    rgba(102, 137, 205),
    rgba(114, 149, 215)
  ]);
  flattenSmoothRegions(data, 8, 1);
  deepEqual(pixelAt(data, 0), rgba(0, 0, 0, 0));
  deepEqual(pixelAt(data, 1), rgba(0, 0, 0, 0));
  deepEqual(pixelAt(data, 2), rgba(84, 120, 190));
  deepEqual(pixelAt(data, 7), rgba(84, 120, 190));
});

test('flat recoloring runs before generated outlines and obeys the custom palette', () => {
  const width = 7, height = 7;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 1; y < 6; y++) {
    for (let x = 1; x < 6; x++) pixels.set(rgba(90 + x * 4, 75 + x * 4, 110 + x * 4), (y * width + x) * 4);
  }
  const { result, colors } = convertFrame({
    pixels, gw: width, gh: height, samples: 1, method: 'nearest',
    noGradients: true, outline: 'alpha', ink: [11, 9, 14], inkWidth: 1,
    palette: { mode: 'custom', colors: [0x0b090e, 0x645475], transparent: true, matte: [255, 255, 255] }
  });
  deepEqual(colors, [0x0b090e, 0x645475]);
  deepEqual(pixelAt(result, 0), rgba(0, 0, 0, 0));
  deepEqual(pixelAt(result, 8), rgba(11, 9, 14));
  deepEqual(pixelAt(result, 24), rgba(100, 84, 117));
});
