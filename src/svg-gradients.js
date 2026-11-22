const svgNamespace = 'http://www.w3.org/2000/svg';

function stopPosition(stop, previous) {
  const raw = stop.getAttribute('offset')?.trim() || '0';
  const number = Number(raw.replace(/%$/, '')) / (raw.endsWith('%') ? 100 : 1);
  return Math.min(1, Math.max(previous, Number.isFinite(number) ? number : 0));
}

function stopValue(stop, property) {
  return stop.style?.getPropertyValue(property)?.trim() || stop.getAttribute(property)?.trim() || '';
}

function highlightPenalty(stop) {
  const opacity = stopValue(stop, 'stop-opacity');
  if (opacity && parseFloat(opacity) === 0) return 2;
  const color = stopValue(stop, 'stop-color').toLowerCase();
  if (color === 'transparent') return 2;
  if (color === 'white') return 1;
  const hex = /^#([0-9a-f]{3,8})$/.exec(color)?.[1];
  if (hex?.length === 3 || hex?.length === 4) {
    if (hex[3] === '0') return 2;
    return [...hex.slice(0, 3)].every(channel => parseInt(channel, 16) >= 14) ? 1 : 0;
  }
  if (hex?.length === 6 || hex?.length === 8) {
    if (hex.slice(6) === '00') return 2;
    return hex.slice(0, 6).match(/../g).every(channel => parseInt(channel, 16) >= 238) ? 1 : 0;
  }
  const rgb = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)/.exec(color);
  return rgb?.slice(1).every(token => parseFloat(token) >= (token.endsWith('%') ? 93 : 238)) ? 1 : 0;
}

function pickStop(stops, rule) {
  if (rule === 'first') return stops[0];
  if (rule === 'last') return stops.at(-1);
  if (rule === 'auto') {
    return stops.reduce((best, stop) => highlightPenalty(stop) < highlightPenalty(best) ? stop : best);
  }
  let position = 0;
  let closest = Infinity;
  let choice;
  for (const stop of stops) {
    position = stopPosition(stop, position);
    const distance = Math.abs(position - .5);
    if (distance < closest) { choice = stop; closest = distance; }
  }
  return choice;
}

export function flattenSvgGradients(root, rule) {
  if (rule === 'keep') return;
  for (const type of ['linearGradient', 'radialGradient']) {
    for (const gradient of root.getElementsByTagNameNS(svgNamespace, type)) {
      const stops = [...gradient.children].filter(child => child.namespaceURI === svgNamespace && child.localName === 'stop');
      // An empty gradient still inherits its linked definition, which is flattened in the same pass.
      if (stops.length < 2) continue;
      const keep = pickStop(stops, rule);
      for (const stop of stops) if (stop !== keep) stop.remove();
      keep.setAttribute('offset', '0');
    }
  }
}
