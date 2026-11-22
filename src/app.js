import { convertFrame } from './pixel-engine.js';
import { colorHex, MAX_COLORS, parsePalette } from './palette.js';
import { flattenSvgGradients } from './svg-gradients.js';
import { imageRect, axisSegments } from './geometry.js';
import { applyLanguage, t } from './i18n.js';
import { createEngineWorker, loadDemoImage } from './platform.js';

const $ = id => document.getElementById(id);
const defaults = {
  preset: '1920x1080', ratio: '16:9', width: 1920, height: 1080, fit: 'contain',
  step: 5, offsetX: 0, offsetY: 0, method: 'adaptive', outline: 'outer',
  ink: '#0b090e', inkWidth: 1, sensitivity: 46, format: 'png', quality: 94,
  transparent: true, matte: '#ffffff', paletteMode: 'source', paletteLimit: 16,
  paletteText: '#100D18 #39315F #AF6D59 #EDB88F', gradient: 'keep', noGradients: false
};
const formatNames = { png: 'PNG', jpeg: 'JPEG', webp: 'WebP' };
const hints = { adaptive: 'hintAdaptive', nearest: 'hintNearest', area: 'hintArea', lanczos: 'hintLanczos' };
const storageKey = 'spritecut-settings-v1';
const outputLimit = 33554432;
let source = null, pending = false, processing = false, exporting = false;
let sourceVersion = 0, version = 0, result = null, timer = null, worker = null;
let workerUnavailable = false;

function readSettings() {
  const config = {};
  for (const [key, value] of Object.entries(defaults)) {
    const field = $(key);
    config[key] = typeof value === 'boolean' ? field.checked
      : typeof value === 'number' ? field.valueAsNumber : field.value;
    if (field.tagName === 'SELECT' && typeof value === 'number') config[key] = Number(field.value);
  }
  if (config.paletteMode !== 'source' || config.noGradients) config.format = 'png';
  return config;
}
function applySettings(config) {
  for (const [key, value] of Object.entries(defaults)) {
    const field = $(key);
    const chosen = config[key] ?? value;
    if (typeof value === 'boolean') field.checked = typeof chosen === 'boolean' ? chosen : value;
    else {
      field.value = chosen;
      if (!field.value) field.value = value;
    }
  }
}
function loadSettings() {
  let stored;
  try { stored = JSON.parse(localStorage.getItem(storageKey)); } catch {}
  applySettings(stored || defaults);
}
function setStatus(message, error = false) {
  $('status').textContent = message;
  $('status').toggleAttribute('data-error', error);
}
function currentResult() {
  return result !== null && result.id === version && !pending;
}
function updateDownload() {
  $('download').disabled = !currentResult() || exporting;
  $('downloadLabel').textContent = exporting ? t('exporting') : t('exportAs', { format: formatNames[$('format').value] });
}
function colorBytes(hex) {
  return [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16));
}
function showConfig(config) {
  const { width, height, step, offsetX, offsetY, method, outline, format, paletteMode } = config;
  const gw = Math.ceil((width + offsetX) / step), gh = Math.ceil((height + offsetY) / step);
  $('grid').textContent = Number.isFinite(gw * gh) ? t('grid', { cols: gw, rows: gh, step }) : '';
  $('stepRange').value = Number.isFinite(step) ? Math.min(32, step) : 5;
  $('methodHint').textContent = t(hints[method]);
  $('sensitivityValue').value = config.sensitivity;
  $('contrastSettings').hidden = outline !== 'contrast';
  $('ink').disabled = $('inkWidth').disabled = outline === 'off';
  $('paletteLimitSettings').hidden = paletteMode !== 'limit';
  $('paletteTextSettings').hidden = paletteMode !== 'custom';
  $('paletteHint').hidden = paletteMode === 'source';
  $('paletteResult').hidden = true;
  $('gradient').disabled = source?.type !== 'SVG';
  $('flatColorExport').hidden = !config.noGradients;
  $('format').value = format;
  $('format').disabled = paletteMode !== 'source' || config.noGradients;
  $('qualitySettings').hidden = format === 'png';
  $('transparent').disabled = format === 'jpeg';
  $('matteSettings').hidden = format !== 'jpeg' && config.transparent;
  updateDownload();
}
function paletteFor(config, ink) {
  const mode = config.paletteMode;
  if (mode === 'source') return null;
  const limit = config.paletteLimit;
  const colors = mode === 'custom' ? parsePalette(config.paletteText) : null;
  if (mode === 'limit' && (!Number.isInteger(limit) || limit < 1 || limit > MAX_COLORS)) {
    throw new Error(t('paletteLimitError'));
  }
  if (mode === 'custom' && !colors) throw new Error(t('paletteTextError'));
  return {
    mode, limit, colors, transparent: config.transparent, matte: colorBytes(config.matte),
    ink: config.outline === 'off' ? null : ink
  };
}
function dimensionsFor(config) {
  if (!['width', 'height', 'step', 'offsetX', 'offsetY'].every(id => $(id).validity.valid)) {
    throw new Error(t('sizeInvalid'));
  }
  const { width, height, step, offsetX, offsetY, method } = config;
  if (width * height > outputLimit) throw new Error(t('areaLimit'));
  const gw = Math.ceil((width + offsetX) / step), gh = Math.ceil((height + offsetY) / step);
  const budget = gw * gh;
  const maxSamples = method === 'nearest' ? source?.type === 'SVG' ? 5 : 1 : 8;
  const maxFit = Math.min(maxSamples, Math.floor(Math.sqrt(12_000_000 / budget)),
    Math.floor(8192 / Math.max(gw, gh)));
  const samples = Math.max(1, method === 'nearest' && maxFit % 2 === 0 ? maxFit - 1 : maxFit);
  const ink = colorBytes(config.ink);
  return { ...config, gw, gh, samples, ink, palette: paletteFor(config, ink) };
}
function fixedRatio(value) {
  if (value === 'source') return source ? source.width / source.height : null;
  if (value === 'free') return null;
  const [w, h] = value.split(':').map(Number);
  return w / h;
}
function linkRatio(driver) {
  const ratio = fixedRatio($('ratio').value);
  if (!ratio) return;
  const input = $(driver);
  if (!input.validity.valid) return;
  const next = driver === 'width' ? 'height' : 'width';
  $(next).value = Math.max(1, Math.round(driver === 'width' ? input.valueAsNumber / ratio : input.valueAsNumber * ratio));
}
function syncSourceDimensions() {
  if (!source) return;
  if ($('preset').value === 'source') {
    $('width').value = Math.max(1, Math.round(source.width));
    $('height').value = Math.max(1, Math.round(source.height));
  } else if ($('ratio').value === 'source') {
    linkRatio('width');
  }
}
function handleSetting(event) {
  const id = event.target.id;
  if (id === 'preset') {
    const preset = $('preset').value;
    if (preset === 'source') {
      $('ratio').value = 'source';
      syncSourceDimensions();
    } else if (preset !== 'custom') {
      const [w, h] = preset.split('x').map(Number);
      $('width').value = w; $('height').value = h;
      $('ratio').value = w === h ? '1:1' : w > h ? '16:9' : '9:16';
    }
  } else if (id === 'ratio') {
    $('preset').value = 'custom';
    linkRatio('width');
  } else if (id === 'width' || id === 'height') {
    $('preset').value = 'custom';
    linkRatio(id);
  } else if (id === 'stepRange') {
    $('step').value = $('stepRange').value;
  }
  queue();
}

const svgUnitScale = { px: 1, '': 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 96 / 72, pc: 16, q: 96 / 101.6 };
function svgLength(value) {
  const match = /^((?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?)(px|in|cm|mm|pt|pc|q)?$/i.exec((value || '').trim());
  if (!match) return null;
  const length = Number(match[1]) * svgUnitScale[(match[2] || '').toLowerCase()];
  return Number.isFinite(length) && length > 0 ? length : null;
}
function getSvg(text, gradient = 'keep') {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.localName !== 'svg' || doc.querySelector('parsererror')) throw new Error(t('invalidSvg'));
  const viewBox = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const aspect = viewBox.length === 4 && viewBox.every(Number.isFinite)
    && viewBox[2] > 0 && viewBox[3] > 0 ? viewBox[2] / viewBox[3] : 0;
  const explicitWidth = svgLength(root.style?.width || root.getAttribute('width'));
  const explicitHeight = svgLength(root.style?.height || root.getAttribute('height'));
  const existingWidth = explicitWidth || (explicitHeight && aspect ? explicitHeight * aspect : aspect ? viewBox[2] : 300);
  const existingHeight = explicitHeight || (explicitWidth && aspect ? explicitWidth / aspect : aspect ? viewBox[3] : 150);
  if (!Number.isFinite(existingWidth) || !Number.isFinite(existingHeight)) throw new Error(t('badSvgSize'));
  const width = Math.max(.01, existingWidth), height = Math.max(.01, existingHeight);
  // Normalize viewBox-only and percentage-sized art. The SVG is decoded in image mode.
  if (!explicitWidth || !explicitHeight || root.namespaceURI !== 'http://www.w3.org/2000/svg') {
    if (root.namespaceURI !== 'http://www.w3.org/2000/svg') {
      root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
    root.setAttribute('width', width);
    root.setAttribute('height', height);
    if (root.style?.width || root.style?.height) {
      root.style.setProperty('width', width + 'px');
      root.style.setProperty('height', height + 'px');
    }
  }
  flattenSvgGradients(root, gradient);
  const markup = new XMLSerializer().serializeToString(root);
  const external = /\b(?:href|src)\s*=\s*["'](?!\s*(?:#|data:|["']))\s*[^"']|url\(\s*["']?\s*(?:https?:|\.\.?\/)|@import\b/i.test(markup);
  return { blob: new Blob([markup], { type: 'image/svg+xml' }), width, height, type: 'SVG', external };
}
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(t('decodeError')));
    image.src = url;
  });
}
async function openFile(file) {
  if (!file) return;
  const id = ++sourceVersion;
  pending = true;
  updateDownload();
  setStatus(t('reading'));
  let url;
  try {
    if (file.size > 100 * 1024 * 1024) throw new Error(t('fileLimit'));
    const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
    const svgText = isSvg ? await file.text() : null;
    const info = isSvg ? getSvg(svgText) : { blob: file, type: '' };
    url = URL.createObjectURL(info.blob);
    const image = await loadImage(url);
    if (id !== sourceVersion) return;
    const width = info.width || image.naturalWidth;
    const height = info.height || image.naturalHeight;
    if (!width || !height) throw new Error(t('dimensionsMissing'));
    if (source) {
      URL.revokeObjectURL(source.url);
      if (source.variant) URL.revokeObjectURL(source.variant.url);
    }
    const type = info.type || file.name.match(/\.([^.]*)$/)?.[1]?.toUpperCase() || t('image');
    source = { image, width, height, type, external: info.external, name: file.name, url, svgText };
    url = null;
    $('filename').textContent = file.name;
    $('filename').title = file.name;
    $('sourceSize').textContent = type + ' · ' + Math.round(width) + ' × ' + Math.round(height);
    $('empty').hidden = true;
    syncSourceDimensions();
    pending = false;
    queue();
  } catch (error) {
    if (id !== sourceVersion) return;
    pending = false;
    updateDownload();
    setStatus(error.message, true);
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

function drawImage(ctx, rect, input, method) {
  // Keep on-grid raster pixels when using nearest neighbor; vector antialiasing is native.
  ctx.imageSmoothingEnabled = method !== 'nearest';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(input.image, rect.x, rect.y, rect.w, rect.h);
}
function allocateCanvas(canvas, width, height, read = false) {
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', read ? { willReadFrequently: true } : undefined);
  if (!ctx) throw new Error(t('canvasError'));
  return ctx;
}
function capture(input, config) {
  const { width, height, step, offsetX, offsetY, gw, gh, samples, method } = config;
  const canvas = document.createElement('canvas');
  const ctx = allocateCanvas(canvas, gw * samples, gh * samples, true);
  const rect = imageRect(config, input);
  for (const x of axisSegments(width, gw, step, offsetX, samples)) {
    for (const y of axisSegments(height, gh, step, offsetY, samples)) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x.at, y.at, x.span, y.span);
      ctx.clip();
      ctx.setTransform(x.scale, 0, 0, y.scale, x.at - x.scale * x.start, y.at - y.scale * y.start);
      drawImage(ctx, rect, input, method);
      ctx.restore();
    }
  }
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  canvas.width = canvas.height = 0;
  return pixels;
}
function getWorker() {
  if (worker || workerUnavailable) return worker;
  try { worker = createEngineWorker(); }
  catch { workerUnavailable = true; }
  if (!worker) return null;
  worker.onmessage = ({ data }) => receive(data);
  worker.onerror = event => {
    event.preventDefault();
    worker.terminate();
    worker = null;
    workerUnavailable = true;
    activeJob = null;
    processing = false;
    queue();
  };
  return worker;
}

let activeJob;
function queue() {
  const maxOffset = Math.max(0, Math.min(127, ($('step').valueAsNumber || 1) - 1));
  for (const id of ['offsetX', 'offsetY']) {
    const field = $(id);
    if (field.max !== String(maxOffset) && field.valueAsNumber > maxOffset) field.value = maxOffset;
    field.max = maxOffset;
  }
  const config = readSettings();
  version++;
  showConfig(config);
  clearTimeout(timer);
  try {
    dimensionsFor(config);
    if ($('quality').validity.valid) {
      try { localStorage.setItem(storageKey, JSON.stringify(config)); } catch {}
    }
  } catch (error) {
    setStatus(error.message, true);
    return;
  }
  if (!source || pending) return;
  if (processing) { setStatus(t('updating')); return; }
  setStatus(t('rendering'));
  timer = setTimeout(run, 85);
}
async function inputForConversion(input, gradient) {
  if (!input.svgText || gradient === 'keep') return input;
  if (input.variant?.gradient === gradient) return input.variant;
  const { blob } = getSvg(input.svgText, gradient);
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const variant = { image, gradient, url, width: input.width, height: input.height };
    if (source === input) {
      if (input.variant) URL.revokeObjectURL(input.variant.url);
      input.variant = variant;
    } else {
      URL.revokeObjectURL(url);
    }
    return variant;
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function run() {
  if (!source || pending || processing) return;
  const id = version;
  try {
    const config = dimensionsFor(readSettings());
    const input = source;
    activeJob = { id, input, config };
    processing = true;
    const gradient = config.noGradients && config.gradient === 'keep' ? 'auto' : config.gradient;
    const raster = await inputForConversion(input, gradient);
    if (id !== version || pending) {
      receive({ id });
      return;
    }
    const pixels = capture(raster, config);
    const job = { id, pixels, ...config };
    const background = getWorker();
    if (background) {
      background.postMessage(job, [pixels.buffer]);
    } else {
      receive({ id, ...convertFrame(job) });
    }
  } catch (error) {
    receive({ id, error: error.message || t('renderError') });
  }
}
function showPalette(colors) {
  if (!colors) return;
  $('paletteResult').hidden = false;
  $('paletteCount').textContent = t('paletteCount', { count: colors.length });
  $('editPalette').hidden = !colors.length || $('paletteMode').value !== 'limit';
  const swatches = colors.map(color => {
    const swatch = document.createElement('li');
    const hex = colorHex(color);
    swatch.style.backgroundColor = hex;
    swatch.title = hex;
    swatch.setAttribute('aria-label', hex);
    return swatch;
  });
  $('swatches').replaceChildren(...swatches);
}

function receive({ id, result: bytes, colors, error }) {
  const job = activeJob;
  activeJob = null;
  processing = false;
  if (pending) return;
  if (id !== version) {
    if (source) timer = setTimeout(run, 35);
    return;
  }
  if (error || !job) { setStatus(error || t('previewError'), true); return; }
  try {
    const { input, config } = job;
    const { gw, gh, width, height, step, offsetX, offsetY, samples } = config;
    const pixel = $('pixelCanvas');
    allocateCanvas(pixel, gw, gh).putImageData(new ImageData(bytes, gw, gh), 0, 0);
    pixel.style.width = 100 * gw * step / width + '%';
    pixel.style.height = 100 * gh * step / height + '%';
    pixel.style.left = -100 * offsetX / width + '%';
    pixel.style.top = -100 * offsetY / height + '%';
    const scale = Math.min(1, 2304 / Math.max(width, height));
    const original = $('sourceCanvas');
    const cw = Math.max(1, Math.round(width * scale)), ch = Math.max(1, Math.round(height * scale));
    const ctx = allocateCanvas(original, cw, ch);
    ctx.setTransform(cw / width, 0, 0, ch / height, 0, 0);
    drawImage(ctx, imageRect(config, input), input);
    result = { id, input, config, colors };
    showPalette(colors);
    $('stageInner').hidden = false;
    resizeFrame();
    const message = t('result', { w: width, h: height, cols: gw, rows: gh });
    setStatus(input.external ? message + ' · ' + t('external') : message);
    $('status').title = t('samples', { n: samples });
  } catch (caught) {
    setStatus(caught.message, true);
  }
  updateDownload();
}
function resizeFrame() {
  if (!result) return;
  const { width, height } = result.config;
  const stage = $('stage');
  const spacing = stage.clientWidth <= 402 ? 24 : 44;
  const scale = $('zoom').value === 'fit'
    ? Math.min(Math.max(1, stage.clientWidth - spacing) / width, Math.max(1, stage.clientHeight - spacing) / height)
    : Number($('zoom').value);
  $('frame').style.width = width * scale + 'px';
  $('frame').style.height = height * scale + 'px';
  const config = readSettings();
  $('frame').style.background = config.format === 'jpeg' || !config.transparent ? config.matte : '';
}
const mime = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
async function exportImage() {
  if (!currentResult() || exporting) return;
  const config = readSettings();
  if (config.format !== 'png' && !$('quality').validity.valid) {
    setStatus(t('badQuality'), true);
    $('quality').focus();
    return;
  }
  const { input, config: geometry } = result;
  const { width, height, gw, gh, step, offsetX, offsetY } = geometry;
  const { format, quality, matte, transparent } = config;
  exporting = true;
  updateDownload();
  const canvas = document.createElement('canvas');
  try {
    const ctx = allocateCanvas(canvas, width, height);
    if (!geometry.palette && (format === 'jpeg' || !transparent)) {
      ctx.fillStyle = matte;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage($('pixelCanvas'), -offsetX, -offsetY, gw * step, gh * step);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, mime[format], quality / 100));
    if (!blob) throw new Error(t('encodeError'));
    if (blob.type !== mime[format]) throw new Error(t('badFormat', { format: formatNames[format] }));
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = input.name.replace(/\.[^.]+$/, '') + '-pixel-' + width + 'x' + height + '.' + (format === 'jpeg' ? 'jpg' : format);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    if (currentResult()) setStatus(t('exported', { format: formatNames[format], w: width, h: height }));
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    canvas.width = canvas.height = 0;
    exporting = false;
    updateDownload();
  }
}

async function openExample() {
  const id = sourceVersion;
  try {
    const sample = await loadDemoImage();
    if (id === sourceVersion) {
      await openFile(new File([sample], 'desert-observatory.svg', { type: 'image/svg+xml' }));
    }
  } catch {
    if (id === sourceVersion) setStatus(t('exampleError'), true);
  }
}
$('open').addEventListener('click', () => $('fileInput').click());
$('example').addEventListener('click', openExample);
$('demo').addEventListener('click', openExample);
$('editPalette').addEventListener('click', () => {
  if (!currentResult() || !result.colors?.length) return;
  $('paletteText').value = result.colors.map(colorHex).join(' ');
  $('paletteMode').value = 'custom';
  queue();
  $('paletteText').focus();
});
$('language').addEventListener('click', () => {
  const next = document.documentElement.lang === 'zh-CN' ? 'en' : 'zh';
  try { localStorage.setItem('spritecut-language', next); } catch {}
  applyLanguage(next);
  queue();
});
$('fileInput').addEventListener('change', event => {
  openFile(event.target.files[0]);
  event.target.value = '';
});
$('download').addEventListener('click', exportImage);
$('settings').addEventListener('submit', event => event.preventDefault());
$('settings').addEventListener('input', handleSetting);
$('reset').addEventListener('click', () => { applySettings(defaults); queue(); });
$('zoom').addEventListener('change', () => {
  resizeFrame();
  const stage = $('stage');
  stage.scrollLeft = (stage.scrollWidth - stage.clientWidth) / 2;
  stage.scrollTop = (stage.scrollHeight - stage.clientHeight) / 2;
});
$('split').addEventListener('input', event => $('frame').style.setProperty('--split', event.target.value + '%'));
for (const button of document.querySelectorAll('[data-view]')) {
  button.addEventListener('click', () => {
    document.querySelector('[data-view][aria-pressed=true]').setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-pressed', 'true');
    $('frame').dataset.mode = button.dataset.view;
  });
}
document.addEventListener('dragover', event => {
  if (!event.dataTransfer.types.includes('Files')) return;
  event.preventDefault();
  $('stage').classList.add('dragging');
});
document.addEventListener('dragleave', event => {
  if (!event.relatedTarget) $('stage').classList.remove('dragging');
});
document.addEventListener('drop', event => {
  if (!event.dataTransfer.files.length) return;
  event.preventDefault();
  $('stage').classList.remove('dragging');
  openFile(event.dataTransfer.files[0]);
});
document.addEventListener('paste', event => {
  const file = Array.from(event.clipboardData?.files || []).find(item => item.type.startsWith('image/'));
  if (file) { event.preventDefault(); openFile(file); }
});
new ResizeObserver(resizeFrame).observe($('stage'));
let language = navigator.language.startsWith('zh') ? 'zh' : 'en';
try { language = localStorage.getItem('spritecut-language') || language; } catch {}
applyLanguage(language);
loadSettings();
queue();
openExample();
