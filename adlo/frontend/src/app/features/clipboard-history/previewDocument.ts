/**
 * 富文本预览文档的注入与主题化。
 *
 * 预览走 `sandbox=""` + `srcDoc` 的 iframe（继承项目既有做法：不授予
 * `allow-scripts` / `allow-same-origin`，内容无法触达宿主）。iframe 是独立文档，
 * 父页面既无法接管它的滚动条，也读不到它的 CSS 变量 —— 因此这里把主题相关的
 * 样式**内联注入**进 srcDoc：
 *
 * 1. `html, body` 置实底（调用方传入当前主题的 `--surface-editing` 值）——
 *    透明链只到 body 为止，剪贴板富文本内层常带不透明白底容器，
 *    仅透明化 html/body 时暗主题下预览仍是一片亮色；暗主题下再把内层
 *    非媒体元素的不透明白底打掉（图片与矢量图形除外），透出该实底；
 * 2. 未显式设色的文本跟随主题前景色，保证透明底上的默认文字仍可读；
 * 3. 原生滚动条改写为项目同款外观（同色系、圆角、悬停加深）。
 *
 * 注入位置优先 `<head>`，其次 `<body>`，再次 `<html>`，都没有才前插 —— 完整文档
 * 若在 `<!DOCTYPE>`/`<html>` 之前插入内容会让解析器进入 quirks 模式。
 */
export function injectPreviewStyles(source: string, css: string): string {
  const style = `<style data-adl-preview>${css}</style>`;
  for (const tag of ['head', 'body', 'html'] as const) {
    const open = new RegExp(`<${tag}\\b[^>]*>`, 'i').exec(source);
    if (open) {
      const at = open.index + open[0].length;
      return source.slice(0, at) + style + source.slice(at);
    }
  }
  return style + source;
}

/** 预览文档的注入样式。`textColor` 取自宿主主题的 `--text-primary`。
 *
 * `options.surface` 传入时作为文档实底（`--surface-editing` 的当前主题值）——
 * 透明链只到 `html,body` 为止，剪贴板富文本内层常带不透明白底容器，
 * 不置实底暗主题下仍是一片白色。省略时保持透明（兼容旧调用）。
 * `options.dark` 为 true 时，把内层非媒体元素的不透明白底打掉，让实底透出来
 * （`img/video/svg/canvas/picture` 除外，保留图片与矢量图形）。
 * `options.nowrap` 为 true 时（关闭自动换行），强制文档内不折行并允许内横滚。
 * `options.zoom` 为宿主字号缩放比例（`fontScale`），`1` 时不注入；iframe 内字号多为
 * px 定死（如 `font-size:13px`），`body{font-size}` 够不着，故用 `html{zoom}` 整体跟随。
 * `zoom` 是非标准属性：Chromium/WebView2 生效，Firefox 静默忽略（优雅降级为 100%）。
 *
 * 注入值均为宿主常量（主题 hex），不含用户输入；`surface` 非 hex 时回退透明，
 * `textColor` 非 hex 时回退继承，避免 `</style>` 逃逸破坏整段样式。
 * `injectPreviewStyles` 的标签正则可能命中注释/脚本字符串内的同名标签
 * （剪贴板 HTML 中概率低），已知局限，暂不处理。 */
export function previewDocumentCss(
  textColor: string,
  options?: { dark?: boolean; surface?: string; nowrap?: boolean; zoom?: number },
): string {
  const safeColor = (value: string | undefined, fallback: string): string =>
    value != null && /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)
      ? value
      : fallback;
  const safeTextColor = safeColor(textColor, 'inherit');
  const baseBackground = safeColor(options?.surface, 'transparent');
  // 门控用校验后值：非法 surface 回退透明时不打白（调用方现只传主题 hex，无行为变化）。
  const darkReset =
    options?.dark && baseBackground !== 'transparent'
      ? `
    /* 暗主题：内层自带白底容器打掉（图片与矢量图形除外），透出宿主编辑底色 */
    body *:not(img):not(video):not(svg):not(canvas):not(picture) {
      background-color: transparent !important;
      box-shadow: none !important;
      text-shadow: none !important;
    }`
      : '';
  const nowrapCss = options?.nowrap
    ? `
    /* 关闭自动换行：文档内不折行，溢出走注入的内横向滚动条 */
    body, body p, body div, body span, body li, body td, body th,
    body pre, body code, body blockquote, body h1, body h2, body h3,
    body h4, body h5, body h6 {
      white-space: pre !important;
      overflow-wrap: normal !important;
      word-break: normal !important;
    }
    body { overflow-x: auto !important; }`
    : '';
  // 字号缩放跟随宿主（`1` 即默认，不注入，保持源文档原生字号）。
  // 非法值（0/负数/NaN/Infinity）绝不注入：`zoom:0` 会让内容消失。
  const zoom = options?.zoom;
  const zoomCss =
    zoom != null && Number.isFinite(zoom) && zoom > 0 && zoom !== 1
      ? `\n    html { zoom: ${zoom}; }`
      : '';
  return `
    html, body {
      background: ${baseBackground} !important;
      color: ${safeTextColor};
      margin: 0;
      padding: 0;
    }
    /* 内容与容器边缘间距：与其他模式（文本/编辑/Markdown/图片，均为 12px）统一。 */
    body { padding: 12px; box-sizing: border-box; }${darkReset}${nowrapCss}${zoomCss}
    /* 与项目自绘滑块同色系：静止 34% → 悬停 54%，圆角 + 内容区裁切留边 */
    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-corner { background: transparent; }
    ::-webkit-scrollbar-thumb {
      background: rgba(127, 127, 127, 0.34);
      background-clip: content-box;
      border: 2px solid transparent;
      border-radius: 5px;
    }
    ::-webkit-scrollbar-thumb:hover { background-color: rgba(127, 127, 127, 0.54); }
    html { scrollbar-width: thin; scrollbar-color: rgba(127,127,127,0.45) transparent; }
  `;
}
