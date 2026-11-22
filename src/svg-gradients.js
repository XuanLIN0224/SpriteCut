const svgNamespace = 'http://www.w3.org/2000/svg';

function stopPosition(stop, previous) {
  const raw = stop.getAttribute('offset')?.trim() || '0';
  const number = Number(raw.replace(/%$/, '')) / (raw.endsWith('%') ? 100 : 1);
  return Math.min(1, Math.max(previous, Number.isFinite(number) ? number : 0));
}

function pickStop(stops, rule) {
  if (rule === 'first') return stops[0];
  if (rule === 'last') return stops.at(-1);
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
