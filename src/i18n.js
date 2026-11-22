const chinese = {
  "tagline": "像素过场工作台",
  "language": "切换语言",
  "open": "打开图片",
  "exportInitial": "导出 PNG",
  "preview": "画面预览",
  "viewMode": "预览模式",
  "original": "原图",
  "compare": "对照",
  "pixelResult": "像素图",
  "zoom": "预览缩放",
  "fitView": "适应画面",
  "split": "对比分界线，左侧原图，右侧像素图",
  "drop": "将 SVG 或其他图片拖到这里",
  "example": "打开示例",
  "waiting": "等待打开图片",
  "canDrop": "可直接拖入图片",
  "settings": "转换设置",
  "reset": "恢复过场预设",
  "canvas": "画幅",
  "size": "尺寸预设",
  "portrait": "竖屏 · 1080×1920",
  "square": "方形 · 1080×1080",
  "originalSize": "原图尺寸",
  "custom": "自定义",
  "aspect": "锁定比例",
  "originalAspect": "原图比例",
  "free": "自由",
  "width": "宽度 px",
  "height": "高度 px",
  "layout": "排版",
  "contain": "完整显示 · 居中留边",
  "cover": "填满画幅 · 居中裁剪",
  "stretch": "拉伸至画幅",
  "pixelation": "像素化",
  "cellSize": "像素格大小",
  "cellSizeA11y": "像素格大小，单位 px",
  "algorithm": "取样算法",
  "adaptive": "保色描线 · 自适应",
  "nearest": "最近邻 · Nearest Neighbor",
  "area": "面积平均 · Area",
  "lanczos": "Lanczos 3 · 高质量降采样",
  "alignment": "像素格对齐",
  "offsetX": "横向偏移 px",
  "offsetY": "纵向偏移 px",
  "alignmentHint": "画幅边缘会截齐像素格，保持设定的输出尺寸。",
  "inking": "黑色描边",
  "outlineRegion": "补描边范围",
  "outer": "外轮廓 · 识别透明或纯色背景",
  "contrast": "外轮廓与高反差内边缘",
  "alpha": "仅透明边界",
  "off": "关闭补描边",
  "inkColor": "描边颜色",
  "inkWidth": "线宽",
  "oneCell": "1 格",
  "twoCells": "2 格",
  "threeCells": "3 格",
  "fourCells": "4 格",
  "sensitivity": "内边缘敏感度",
  "export": "导出",
  "format": "文件格式",
  "quality": "质量 %",
  "transparent": "保留透明背景",
  "matte": "底色",
  "dropNow": "松开以打开图片",
  "hintAdaptive": "适合插画与过场。多点取样，优先保留色块和已有的细暗线。",
  "hintNearest": "取每格中心的一个颜色。适合已有像素图和对齐的图形。",
  "hintArea": "按覆盖面积混合颜色。适合照片或需要柔和色阶的图片。",
  "hintLanczos": "使用 Lanczos 3 滤镜降采样。适合照片和细密纹理。",
  "exporting": "正在导出…",
  "exportAs": "导出 {format}",
  "grid": "{cols} × {rows} 格 · 每格 {step} px",
  "sizeInvalid": "尺寸须为 1–8192 px，像素格为 1–128 px，偏移须小于格宽。",
  "areaLimit": "画面面积上限为 3355 万像素。请缩小输出尺寸。",
  "invalidSvg": "SVG 无法解析，请检查原文件。",
  "badSvgSize": "SVG 的画幅数据无效。",
  "decodeError": "无法读取这张图。请另存为 SVG、PNG、JPEG 或 WebP 后重试。",
  "reading": "正在读取图片…",
  "fileLimit": "单张图片上限为 100 MB。",
  "dimensionsMissing": "图片没有可用尺寸，请检查文件。",
  "image": "图片",
  "canvasError": "浏览器无法为这个尺寸创建画布。请缩小输出尺寸。",
  "updating": "正在更新预览…",
  "rendering": "正在生成像素图…",
  "renderError": "转换失败。",
  "previewError": "未能生成预览。",
  "result": "{w} × {h} px · {cols} × {rows} 格",
  "external": "SVG 外部资源需内嵌",
  "samples": "{n} × {n} 采样/格",
  "badQuality": "导出质量须为 1–100%。",
  "encodeError": "未能编码图片。请尝试更小的尺寸。",
  "badFormat": "当前浏览器无法编码 {format}，请选择 PNG 或用 Chrome 打开。",
  "exported": "已导出 {format} · {w} × {h} px",
  "exampleError": "示例图片加载失败。你仍可直接打开自己的图片。"
};

const english = {
  "dropNow": "Drop to open image",
  "hintAdaptive": "Keeps flat colors and thin ink lines in illustrations.",
  "hintNearest": "Uses the center color of each block. Good for images already on a grid.",
  "hintArea": "Blends the colors covered by each block for smoother transitions.",
  "hintLanczos": "Keeps sharp detail when shrinking photos and textured images.",
  "exporting": "Exporting…",
  "exportAs": "Export {format}",
  "grid": "{cols} × {rows} blocks · {step} px each",
  "sizeInvalid": "Use a canvas size of 1–8192 px and blocks of 1–128 px. Offsets must be smaller than the block size.",
  "areaLimit": "The output is limited to 33.5 megapixels. Choose a smaller canvas.",
  "invalidSvg": "Could not read the SVG. Check that the source is a valid SVG file.",
  "badSvgSize": "The SVG has invalid canvas dimensions.",
  "decodeError": "Could not open this image. Save it as SVG, PNG, JPEG, or WebP and try again.",
  "reading": "Opening image…",
  "fileLimit": "Images must be 100 MB or smaller.",
  "dimensionsMissing": "No usable dimensions were found in this image.",
  "image": "Image",
  "canvasError": "Your browser could not create this canvas. Try a smaller output size.",
  "updating": "Updating preview…",
  "rendering": "Converting to pixel art…",
  "renderError": "Conversion failed.",
  "previewError": "Could not render the preview.",
  "result": "{w} × {h} px · {cols} × {rows} blocks",
  "external": "Embed external resources in your SVG",
  "samples": "{n} × {n} samples per block",
  "badQuality": "Export quality must be between 1% and 100%.",
  "encodeError": "Could not encode the image. Try a smaller output size.",
  "badFormat": "Your browser cannot encode {format}. Select PNG or use Chrome.",
  "exported": "Exported {format} · {w} × {h} px",
  "exampleError": "The example did not load. You can still open your own image."
};

let current = 'en';
let staticDefaults;

export function t(key, vars = {}) {
  const source = (current === 'zh' ? chinese : english)[key] ?? key;
  return source.replace(/\{(\w+)\}/g, (_, name) => vars[name]);
}

export function applyLanguage(language) {
  current = language === 'zh' ? 'zh' : 'en';
  document.documentElement.lang = current === 'zh' ? 'zh-CN' : 'en';
  staticDefaults ??= Array.from(document.querySelectorAll('[data-i18n], [data-i18n-label]'), element => {
    if (element.dataset.i18nLabel) {
      return { element, key: element.dataset.i18nLabel, label: true, value: element.getAttribute('aria-label') };
    }
    return { element, key: element.dataset.i18n, label: false, value: element.textContent };
  });
  for (const { element, key, label, value } of staticDefaults) {
    const translation = current === 'zh' ? t(key) : value;
    if (label) element.setAttribute('aria-label', translation);
    else element.textContent = translation;
  }
  const button = document.getElementById('language');
  button.textContent = current === 'zh' ? 'English' : '中文';
  button.title = button.getAttribute('aria-label');
  document.getElementById('stage').dataset.dropText = t('dropNow');
}
