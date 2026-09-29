// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 落点高亮覆盖层的接线与样式契约（**共享实现**：`@components/RevealHighlight`）。
 *
 * 覆盖层作为宿主内**常驻**子元素（横向铺满并与宿主左右边缘贴合），由共享 helper 定位；
 * 两个消费方共用同一套实现，只在配色变体上区分：
 * - 文件面板检索 → 预览落点（`warning`）；
 * - 设置面板搜索设置 → 跳转落点（`accent`）。
 * 变更面板不渲染它（无检索模式 → 不闪烁）。
 *
 * 为何必须用覆盖层而非给目标元素加背景：宿主内的滚动列普遍带左右内边距，且该列
 * **自身就是滚动容器**（`overflow-y: auto` 使 `overflow-x` 计算值为 auto，会裁剪内部溢出），
 * 块级背景物理上到不了宿主边缘。
 */
function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const filePreviewRenderersSource = readSource('../../regions/right-panel/FilePreviewRenderers.tsx');
const settingsPanelSource = readSource('../../components/settings/SettingsPanel.tsx');
const diffEditorSectionSource = readSource(
  '../../regions/right-panel/panels/DiffEditorSection.tsx',
);
const revealHighlightSource = readSource('../../utils/revealHighlight.ts');
const revealSourceLineSource = readSource('./revealSourceLine.ts');
const revealHighlightCss = readSource('../../../../src/styles/components/reveal-highlight.css');
const editorSurfaceCss = readSource('../../../../src/styles/regions/rightpanel/editor-surface.css');

function extractCssBlock(css: string, selector: string): string {
  const start = css.indexOf(selector);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('\n}', start);
  expect(end).toBeGreaterThan(start);
  return css.slice(start, end + 2);
}

describe('reveal highlight overlay', () => {
  it('renders the overlay inside the files-panel markdown preview surface', () => {
    expect(filePreviewRenderersSource).toContain('RevealHighlightLayers');
    // 覆盖层必须是预览面（position: relative 且不滚动）的直接子元素，才能横向铺满并贴合边缘
    expect(filePreviewRenderersSource).toContain('adl-tool-editor__surface--preview');
  });

  it('reuses the same shared layers in the settings panel content area', () => {
    expect(settingsPanelSource).toContain('RevealHighlightLayers');
    // 宿主取不滚动的内容外框（几何等于主内容视口）：高亮条才能铺到主内容显示区右边缘
    expect(settingsPanelSource).toContain('adl-settings-panel__content-outer');
    // 设置面板走主题蓝变体；文件面板走警示黄变体（同一实现、两套配色）
    expect(settingsPanelSource).toContain("variant: 'accent'");
    expect(revealSourceLineSource).toContain("variant: 'warning'");
  });

  it('keeps the changes panel free of the overlay (no search mode there → no flash)', () => {
    // 落点高亮只在检索文件模式需要；变更面板大纲只定位，故其预览面不应渲染（否则是永不激活的死标记）。
    expect(diffEditorSectionSource).not.toContain('RevealHighlightLayers');
  });

  it('keeps the overlay viewport out of the surface fill rule', () => {
    expect(editorSurfaceCss).toContain(
      '.adl-tool-editor__surface > div:not(.adl-sticky-context):not(.adl-reveal-highlight-viewport)',
    );
  });

  it('bleeds the highlight edge to edge with square corners', () => {
    const block = extractCssBlock(revealHighlightCss, '.adl-reveal-highlight {\n');
    expect(block).toContain('position: absolute;');
    expect(block).toContain('left: 0;');
    expect(block).toContain('right: 0;');
    expect(block).not.toContain('border-radius');
  });

  it('clips the highlight so it cannot add scrollable overflow to the host', () => {
    const viewport = extractCssBlock(revealHighlightCss, '.adl-reveal-highlight-viewport {\n');
    expect(viewport).toContain('position: absolute;');
    expect(viewport).toContain('inset: 0;');
    expect(viewport).toContain('overflow: hidden;');
    expect(viewport).toContain('pointer-events: none;');
  });

  it('keeps the flash duration in a single source shared by TS and CSS', () => {
    // 时长若两处各写一份会漂移：TS 常量注入 CSS 变量，关键帧只消费该变量。
    expect(revealHighlightSource).toContain("'--adl-reveal-highlight-duration'");
    expect(revealHighlightSource).toContain('setProperty(DURATION_VAR');
    expect(revealHighlightCss).toContain('var(--adl-reveal-highlight-duration');
    // CSS 兜底值与 TS 常量必须同值（兜底虽被 JS 覆盖，仍是「两份时长」的漂移点）。
    // 正则失配要给出干净的 expect 失败而非 TypeError；兜底单位允许 s / ms。
    const tsMatch = /REVEAL_HIGHLIGHT_DURATION_MS = (\d+)/.exec(revealHighlightSource);
    expect(
      tsMatch,
      'revealHighlight.ts missing REVEAL_HIGHLIGHT_DURATION_MS literal',
    ).not.toBeNull();
    const tsDuration = Number(tsMatch![1]);
    const cssMatch = /var\(--adl-reveal-highlight-duration,\s*([\d.]+)(ms|s)\)/.exec(
      revealHighlightCss,
    );
    expect(cssMatch, 'reveal-highlight.css missing fallback duration').not.toBeNull();
    const fallbackMs = cssMatch![2] === 'ms' ? Number(cssMatch![1]) : Number(cssMatch![1]) * 1000;
    expect(fallbackMs).toBe(tsDuration);
  });

  it('keeps the host non-scrolling precondition that the alignment math relies on', () => {
    // 对齐只按 offsetParent 的矩形差计算：宿主一旦真滚动，高亮条不会跟随。
    // 文件面板宿主声明了 overflow-y: auto，靠填充规则把直接子元素夹在 100% 高才实际不滚 —— 锁住该前提。
    // 断言必须落在**该规则的规则体**内：切到文件末尾会让后面的 .adl-cm-editor { height: 100% } 顶上，
    // 规则被改后本断言仍绿（名不副实的护栏）。
    const start = editorSurfaceCss.indexOf('.adl-tool-editor__surface > div:not(');
    expect(start).toBeGreaterThanOrEqual(0);
    const bodyStart = editorSurfaceCss.indexOf('{', start);
    const fillRule = editorSurfaceCss.slice(
      bodyStart + 1,
      editorSurfaceCss.indexOf('}', bodyStart),
    );
    expect(fillRule).toContain('height: 100%');
    expect(fillRule).toContain('width: 100%');
  });

  it('expresses the two color variants as variable rebinding on the same keyframes', () => {
    // 变体只重绑两个变量；关键帧与几何完全共用（避免复制一份动画规则再各改各的）。
    expect(revealHighlightCss).toContain('.adl-reveal-highlight--warning');
    expect(revealHighlightCss).toContain('.adl-reveal-highlight--accent');
    // 两侧变体都按**规则体范围**断言：基础规则带中性兜底后，全文件 toContain 会恒真。
    const warningBody = extractCssBlock(revealHighlightCss, '.adl-reveal-highlight--warning {\n');
    expect(warningBody).toContain('--adl-reveal-highlight-bg: var(--warning-soft)');
    expect(warningBody).toContain('--adl-reveal-highlight-line: var(--warning)');
    const accentBody = extractCssBlock(revealHighlightCss, '.adl-reveal-highlight--accent {\n');
    expect(accentBody).toContain('--adl-reveal-highlight-bg: var(--accent-subtle)');
    expect(accentBody).toContain('--adl-reveal-highlight-line: var(--accent)');
    expect(revealHighlightCss.match(/@keyframes adl-reveal-highlight-fade/g)).toHaveLength(1);
  });

  it('does not declare a preview column width that the surface fill rule would override', () => {
    // 预存矛盾：`.adl-tool-editor__surface > div:not(...)` 以更高特异性把预览列强制为 100% 宽，
    // 故 `.adl-markdown-preview` 不能再声明 max-width/margin:auto（声明只会与实际生效值冲突）。
    const markdownPreviewCss = readSource(
      '../../../../src/styles/regions/rightpanel/markdown-preview.css',
    );
    expect(markdownPreviewCss).not.toContain('width: min(100%, 920px)');
    // 覆盖层样式已迁出预览样式表：单一真源在共享样式文件里。
    expect(markdownPreviewCss).not.toContain('.adl-reveal-highlight {');
  });
});
