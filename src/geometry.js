export function imageRect(config, image) {
  const { width, height, fit } = config;
  if (fit === 'stretch') return { x: 0, y: 0, w: width, h: height };
  const fitScale = (fit === 'cover' ? Math.max : Math.min)(width / image.width, height / image.height);
  const w = image.width * fitScale, h = image.height * fitScale;
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

export function axisSegments(length, grid, step, offset, samples) {
  // At most three affine segments: clipped first cell, complete cells, clipped last cell.
  const pieces = [];
  let i = 0;
  while (i < grid) {
    const start = Math.max(0, i * step - offset);
    const end = Math.min(length, (i + 1) * step - offset);
    const count = end - start === step ? Math.max(1, Math.floor((length - start) / step)) : 1;
    pieces.push({ start, at: i * samples, span: count * samples, scale: samples / (end - start) });
    i += count;
  }
  return pieces;
}
