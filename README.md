# SpriteCut

[Download SpriteCut ZIP](https://github.com/XuanLIN0224/SpriteCut/releases/latest/download/SpriteCut.zip) · [简体中文](docs/README.zh-CN.md)

![SpriteCut cover showing a desert observatory as a vector illustration and as pixel art](docs/cover.png)

SpriteCut turns vector illustrations into pixel art for game cutscenes, backgrounds, and sprites. Open an SVG, pick how big the blocks should look, and export a PNG at the resolution your game needs. The preview lets you compare the result with your original before exporting.

The default preset takes a 4K SVG down to **1920 × 1080**, using **5 × 5 px** blocks. That gives you a **384 × 216** pixel grid inside a 1080p image. The adaptive sampler keeps flat fills and looks for thin, dark lines that might disappear with a single center sample.

## Download and run

Download [SpriteCut.zip](https://github.com/XuanLIN0224/SpriteCut/releases/latest/download/SpriteCut.zip), extract it, and open **SpriteCut.html** in a modern browser. The packaged editor runs offline. Find previous versions on the [Releases page](https://github.com/XuanLIN0224/SpriteCut/releases).

## Run from source

With [Node.js](https://nodejs.org/) 20 or later installed, run this from the project folder.

```sh
npm start
```

Open **http://127.0.0.1:4173**. The editor runs without installing packages. Use **Try example** to load the desert observatory, or drop in your own SVG, PNG, JPEG, or WebP. Image processing runs in your browser and your files stay on your device.

1. Pick a size preset or set an exact width and height. Choose **Fit entire image**, **Fill and crop**, or **Stretch**.
2. Set the pixel size and use **Compare** to check the edges. Use **Silhouette** for outer lines or **Off** to keep only lines already in the original.
3. Export **PNG** for crisp, lossless color and optional transparency. **JPEG** and **WebP** are available when your browser supports those encoders.

If the source uses externally linked images, embed them in the SVG before importing. For transparent output, the input needs transparent regions. The **Keep transparency** setting preserves them.

## Control the final colors

Turn on **Colors → No gradients** to fill each native SVG gradient with one paint color and simplify smooth shading into solid blocks. The automatic SVG choice favors a visible non-white stop when it can identify one. You can still pick the first, middle, or last stop yourself. With PNG and JPEG, colors are already part of the image, so the app finds continuous transitions from neighboring pixels. Very complex shading can leave separate blocks. This mode exports PNG to keep clean boundaries.

In **Colors → Output palette**, choose **Limit color count** and enter a maximum from **1 to 64**. The result uses solid color steps without dither. The preview shows the colors it actually uses. Pick **Use as custom palette** to edit those colors, or enter your own hex values in **Custom palette**. Leave out pure white and near-white colors if you want neither in the result.

For SVGs, **SVG gradients** can replace a whole linear or radial gradient with one of its stops. Try the first, middle, or last stop to keep the underlying color instead of a white highlight. The control works on vector gradients. For gradients baked into a PNG or JPEG, use a limited or custom palette to reduce the number of tones.

A limited or custom palette uses PNG to preserve exact RGB values. If you keep transparency, each block is either clear or opaque. Fully transparent pixels do not count toward the limit.

## Sampling methods

| Method | When to use it |
| --- | --- |
| Adaptive · Color and ink | Flat-color illustrations and drawings with fine ink lines |
| Nearest neighbor | Art that is already aligned to a pixel grid |
| Area average | Gradients or imagery where each block should reflect all the colors it covers |
| Lanczos 3 | Photos and textured images that need a sharper downsample |

## Project layout

| Path | Role |
| --- | --- |
| `index.html` and `src/styles.css` | Responsive editor and accessible controls |
| `src/app.js` and `src/i18n.js` | Image loading, preview, export, and English/Chinese labels |
| `src/pixel-engine.js`, `src/geometry.js`, and `src/worker.js` | Sampling, outlines, layout, and background conversion |
| `src/palette.js` and `src/svg-gradients.js` | Output colors and SVG gradient flattening |
| `assets/` | Original demonstration SVG and app icon |
| `tests/` | Automated checks for grid placement, color, transparency, and outlines |

Run the checks with `npm test`. To build the offline edition, run `npm ci --ignore-scripts` and `npm run build:offline`. The build writes `dist/SpriteCut/`.

To publish a new version, update the version in `package.json` and `package-lock.json`, add notes to `docs/releases/vX.Y.Z.md`, commit, and push the matching `vX.Y.Z` tag. GitHub Actions tests, packages, and attaches the ZIP to a GitHub Release.

Created by [XuanLIN0224](https://github.com/XuanLIN0224).
