import { deepEqual, equal } from 'node:assert/strict';
import test from 'node:test';
import { flattenSvgGradients } from '../src/svg-gradients.js';

const ns = 'http://www.w3.org/2000/svg';

function fixture() {
  const gradients = {
    linearGradient: [{ children: [] }],
    radialGradient: [{ children: [] }, { children: [], href: '#linear' }]
  };
  function populate(gradient, stops) {
    gradient.children = stops.map(([offset, color]) => ({
      namespaceURI: ns,
      localName: 'stop',
      offset, color,
      getAttribute(name) { return name === 'stop-color' ? color : this[name]; },
      setAttribute(name, value) { this[name] = value; },
      remove() { gradient.children = gradient.children.filter(stop => stop !== this); }
    }));
  }
  populate(gradients.linearGradient[0], [['0%', '#122646'], ['52%', '#343E72'], ['100%', '#FFFFFF']]);
  populate(gradients.radialGradient[0], [['0', '#FFFFFF'], ['1', '#C78B57']]);
  return { gradients, getElementsByTagNameNS: (namespace, type) => namespace === ns ? gradients[type] : [] };
}

test('keep mode does not rewrite SVG gradient stops', () => {
  const root = fixture();
  flattenSvgGradients(root, 'keep');
  equal(root.gradients.linearGradient[0].children.length, 3);
  equal(root.gradients.radialGradient[0].children.length, 2);
});

test('flattening keeps a chosen original stop, and preserves gradient references', () => {
  for (const [rule, linear, radial] of [
    ['first', '#122646', '#FFFFFF'],
    ['middle', '#343E72', '#FFFFFF'],
    ['last', '#FFFFFF', '#C78B57']
  ]) {
    const root = fixture();
    flattenSvgGradients(root, rule);
    for (const [shape, color] of [['linearGradient', linear], ['radialGradient', radial]]) {
      deepEqual(root.gradients[shape][0].children.map(stop => [stop.offset, stop.color]), [['0', color]]);
    }
    equal(root.gradients.radialGradient[1].href, '#linear');
    equal(root.gradients.radialGradient[1].children.length, 0);
  }
});

test('automatic SVG flattening prefers an opaque non-white paint stop', () => {
  const root = fixture();
  flattenSvgGradients(root, 'auto');
  deepEqual(root.gradients.linearGradient[0].children.map(stop => stop.color), ['#122646']);
  deepEqual(root.gradients.radialGradient[0].children.map(stop => stop.color), ['#C78B57']);
});
