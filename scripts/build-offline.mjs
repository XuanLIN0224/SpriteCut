import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { build } from 'esbuild';

const root = new URL('../', import.meta.url);
const text = name => readFile(new URL(name, root), 'utf8');

const [html, style, icon, demo, manifest] = await Promise.all([
  text('index.html'), text('src/styles.css'), text('assets/icon.svg'),
  text('assets/desert-observatory.svg'), text('package.json')
]);
const { version } = JSON.parse(manifest);
const options = { absWorkingDir: fileURLToPath(root), bundle: true, write: false,
  platform: 'browser', format: 'iife', target: 'es2022' };
const worker = (await build({ ...options, entryPoints: ['src/worker.js'] })).outputFiles[0].text;
new Script(worker, { filename: 'offline-worker.js' });

const offlinePlatform = {
  name: 'offline-platform',
  setup(build) {
    build.onResolve({ filter: /^\.\/platform\.js$/ }, () => ({
      path: 'platform', namespace: 'spritecut-offline'
    }));
    build.onLoad({ filter: /^platform$/, namespace: 'spritecut-offline' }, () => ({ contents: `
      export function createEngineWorker() {
        const url = URL.createObjectURL(new Blob([${JSON.stringify(worker)}], { type: 'text/javascript' }));
        try {
          return new Worker(url);
        } finally {
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
        }
      }
      export function loadDemoImage() {
        return new Blob([${JSON.stringify(demo)}], { type: 'image/svg+xml' });
      }
    ` }));
  }
};
const app = (await build({ ...options, entryPoints: ['src/app.js'], plugins: [offlinePlatform] })).outputFiles[0].text;
new Script(app, { filename: 'offline-app.js' });

function replaceRequired(html, original, replacement) {
  if (!html.includes(original)) throw new Error('Missing offline build placeholder: ' + original);
  return html.replace(original, () => replacement);
}

let page = replaceRequired(html, '<link rel="stylesheet" href="./src/styles.css">', '<style>\n' + style + '</style>');
page = replaceRequired(page, 'href="./assets/icon.svg"', 'href="data:image/svg+xml;base64,' + Buffer.from(icon).toString('base64') + '"');
page = replaceRequired(page, '<script type="module" src="./src/app.js"></script>',
  '<script>\n' + app.replace(/<\/script/gi, '<\\/script') + '</script>');

const folder = new URL('dist/SpriteCut/', root);
await mkdir(folder, { recursive: true });
await Promise.all([
  writeFile(new URL('SpriteCut.html', folder), page),
  writeFile(new URL('Quickstart.txt', folder), `SpriteCut v${version}

ENGLISH
1. Extract SpriteCut.zip using your system's unzip tool.
2. Double-click SpriteCut.html to open it in a modern browser.
3. Open an SVG or other image, change the settings, and click Export PNG.

The app works offline. Your images are processed on your device.
The default is 1920 × 1080 with 5 × 5 px blocks.
Use Colors → No gradients for solid fills, or set a maximum number of colors.

简体中文
1. 解压 SpriteCut.zip。
2. 双击 SpriteCut.html，用新版浏览器打开。
3. 打开 SVG 或其他图片，调整设置后点击「导出 PNG」。

工具可离线运行，图片在本机处理。默认导出 1920 × 1080，
每格 5 × 5 像素。在「颜色」面板开启「无渐变」或设置颜色上限。

https://github.com/XuanLIN0224/SpriteCut/releases/latest
`)
]);
console.log('Built SpriteCut v' + version + ' in dist/SpriteCut');
