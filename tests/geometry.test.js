import { deepEqual, equal, ok } from 'node:assert/strict';
import test from 'node:test';
import { axisSegments, imageRect } from '../src/geometry.js';

test('the 4K illustration fits a 1080p 16:9 canvas exactly', () => {
  deepEqual(imageRect({ width: 1920, height: 1080, fit: 'contain' }, { width: 3840, height: 2160 }),
    { x: 0, y: 0, w: 1920, h: 1080 });
});

test('fit, fill, and stretch use the requested geometry', () => {
  const source = { width: 80, height: 80 };
  const canvas = { width: 100, height: 50 };
  deepEqual(imageRect({ ...canvas, fit: 'cover' }, source), { x: 0, y: -25, w: 100, h: 100 });
  deepEqual(imageRect({ ...canvas, fit: 'contain' }, source), { x: 25, y: 0, w: 50, h: 50 });
  deepEqual(imageRect({ ...canvas, fit: 'stretch' }, source), { x: 0, y: 0, w: 100, h: 50 });
});

test('partial grid cells preserve exact canvas coverage and consume all samples', () => {
  for (const length of [1, 7, 71, 1080, 103, 1920]) {
    for (const step of [1, 5, 32, 128]) {
      for (const offset of [0, Math.floor(step / 2), step - 1]) {
        const count = Math.ceil((length + offset) / step);
        const segments = axisSegments(length, count, step, offset, 8);
        equal(segments[0].start, 0);
        const end = segments.reduce((next, piece) => {
          ok(Math.abs(next - piece.start) < 1e-8);
          return next + piece.span / piece.scale;
        }, 0);
        ok(Math.abs(end - length) < 1e-8);
        equal(segments.at(-1).at + segments.at(-1).span, count * 8);
      }
    }
  }
});
