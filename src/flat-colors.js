const rgbKey = (data, i) => (data[i] >> 4) << 8 | (data[i + 1] >> 4) << 4 | data[i + 2] >> 4;

function continuousEdge(data, from, to, before, after) {
  const dr = data[to] - data[from];
  const dg = data[to + 1] - data[from + 1];
  const db = data[to + 2] - data[from + 2];
  const step = Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db));
  if (step <= 16) return true;
  if (step > 60) return false;
  // A stronger change can still be a ramp when its direction and size continue into the next cell.
  return (before >= 0 && data[before + 3] &&
      Math.abs(data[from] - data[before] - dr) <= 7 &&
      Math.abs(data[from + 1] - data[before + 1] - dg) <= 7 &&
      Math.abs(data[from + 2] - data[before + 2] - db) <= 7)
    || (after >= 0 && data[after + 3] &&
      Math.abs(data[after] - data[to] - dr) <= 7 &&
      Math.abs(data[after + 1] - data[to + 1] - dg) <= 7 &&
      Math.abs(data[after + 2] - data[to + 2] - db) <= 7);
}

export function flattenSmoothRegions(data, width, height) {
  const size = width * height;
  const visited = new Uint8Array(Math.ceil(size / 8));
  const bins = new Uint32Array(4096);
  const touched = new Uint16Array(4096);
  let queue = new Uint32Array(Math.min(size, 4096));
  let count = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) data.fill(0, i, i + 4);
    else data[i + 3] = 255;
  }

  function mark(index) {
    visited[index >> 3] |= 1 << (index & 7);
    if (count === queue.length) {
      const larger = new Uint32Array(Math.min(size, Math.max(1, queue.length * 2)));
      larger.set(queue);
      queue = larger;
    }
    queue[count++] = index;
  }
  function isUnvisited(index) {
    return data[index * 4 + 3] && !(visited[index >> 3] & (1 << (index & 7)));
  }
  function visit(from, to, before, after) {
    if (isUnvisited(to) && continuousEdge(data, from * 4, to * 4, before * 4, after * 4)) mark(to);
  }

  for (let start = 0; start < size; start++) {
    if (!isUnvisited(start)) continue;
    count = 0;
    mark(start);
    let used = 0, dominant = 0, highest = 0;
    let red = 0, green = 0, blue = 0;
    for (let read = 0; read < count; read++) {
      const index = queue[read], i = index * 4;
      const key = rgbKey(data, i);
      if (!bins[key]) touched[used++] = key;
      const weight = ++bins[key];
      if (weight > highest) { highest = weight; dominant = key; }
      red += data[i]; green += data[i + 1]; blue += data[i + 2];

      const x = index % width;
      const left = x > 0 ? index - 1 : -1;
      const right = x + 1 < width ? index + 1 : -1;
      const up = index >= width ? index - width : -1;
      const down = index + width < size ? index + width : -1;
      if (left >= 0) visit(index, left, right, x >= 2 ? index - 2 : -1);
      if (right >= 0) visit(index, right, left, x + 2 < width ? index + 2 : -1);
      if (up >= 0) visit(index, up, down, index >= 2 * width ? index - 2 * width : -1);
      if (down >= 0) visit(index, down, up, index + 2 * width < size ? index + 2 * width : -1);
    }

    if (count > 1) {
      const keepDominant = highest >= count * .3;
      const r = red / count, g = green / count, b = blue / count;
      let closest = Infinity, pick = start * 4;
      // Use an actual source shade, favoring an existing prominent fill over a short highlight.
      for (let j = 0; j < count; j++) {
        const i = queue[j] * 4;
        if (keepDominant && rgbKey(data, i) !== dominant) continue;
        const distance = (data[i] - r) ** 2 + (data[i + 1] - g) ** 2 + (data[i + 2] - b) ** 2;
        if (distance < closest) { closest = distance; pick = i; }
      }
      const fill = data.subarray(pick, pick + 3);
      for (let j = 0; j < count; j++) data.set(fill, queue[j] * 4);
    }
    for (let i = 0; i < used; i++) bins[touched[i]] = 0;
  }
}
