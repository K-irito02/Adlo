// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 落点高亮覆盖层的接线与样式契约：
 * 覆盖层常驻于**文件面板**的预览面内（横向铺满并与左右边缘贴合），由共享 helper 定位；
 * 变更面板不渲染它（无检索模式 → 不闪烁）。
 *
 * 为何必须用覆盖层而非给目标块加背景：预览正文位于 `.adl-markdown-preview` 列内
 * （左右各 `var(--space-10)` = 40px 内边距），且该列**自身就是滚动容器**（`overflow-y: auto`
 * 使 `overflow-x` 计算值为 auto，会裁剪内部溢出），块级背景物理上到不了预览面边缘。
 */
const filePreviewRenderersSource = readFileSync(
  new URL('../../regions/right-panel/FilePreviewRenderers.tsx', import.meta.url),
  'utf8',
);
const diffEditorSectionSource = readFileSync(
  new URL('../../regions/right-panel/panels/DiffEditorSection.tsx', import.meta.url),
  'utf8',
);
const markdownPreviewCss = readFileSync(
  new URL('../../../../src/styles/regions/rightpanel/markdown-preview.css', import.meta.url),
  'utf8',
);
const revealSourceLineSource = readFileSync(
  new URL('./revealSourceLine.ts', import.meta.url),
  'utf8',
);
const editorSurfaceCss = readFileSync(
  new URL('../../../../src/styles/regions/rightpanel/editor-surface.css', import.meta.url),
  'utf8',
);

function extractCssBlock(css: string, selector: string): string {
  const start = css.indexOf(selector);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('\n}', start);
  expect(end).toBeGreaterThan(start);
  return css.slice(start, end + 2);
}

describe('reveal highlight overlay', () => {
  it('renders the overlay inside the files-panel markdown preview surface', () => {
    expect(filePreviewRenderersSource).toContain('FLASH_OVERLAY_CLASS');
    expect(filePreviewRenderersSource).toContain('FLASH_OVERLAY_VIEWPORT_CLASS');
    // 覆盖层必须是预览面（position: relative 且不滚动）的直接子元素，才能横向铺满并贴合边缘
    expect(filePreviewRenderersSource).toContain('adl-tool-editor__surface--preview');
  });

  it('keeps the changes panel free of the overlay (no search mode there → no flash)', () => {
    // 落点高亮只在检索文件模式需要；变更面板大纲只定位，故其预览面不应渲染（否则是永不激活的死标记）。
    expect(diffEditorSectionSource).not.toContain('FLASH_OVERLAY_CLASS');
    expect(diffEditorSectionSource).not.toContain('FLASH_OVERLAY_VIEWPORT_CLASS');
  });

  it('keeps the overlay viewport out of the surface fill rule', () => {
    expect(editorSurfaceCss).toContain(
      '.adl-tool-editor__surface > div:not(.adl-sticky-context):not(.adl-md-flash-overlay-viewport)',
    );
  });

  it('bleeds the highlight edge to edge with square corners', () => {
    const block = extractCssBlock(markdownPreviewCss, '.adl-md-flash-overlay {\n');
    expect(block).toContain('position: absolute;');
    expect(block).toContain('left: 0;');
    expect(block).toContain('right: 0;');
    expect(block).not.toContain('border-radius');
  });

  it('clips the highlight so it cannot add scrollable overflow to the preview surface', () => {
    const viewport = extractCssBlock(markdownPreviewCss, '.adl-md-flash-overlay-viewport {\n');
    expect(viewport).toContain('position: absolute;');
    expect(viewport).toContain('inset: 0;');
    expect(viewport).toContain('overflow: hidden;');
    expect(viewport).toContain('pointer-events: none;');
  });

  it('replaces the legacy per-block flash class', () => {
    expect(markdownPreviewCss).not.toContain('.adl-md-flash {');
    expect(markdownPreviewCss).toContain('.adl-md-flash-overlay.is-active');
  });

  it('keeps the flash duration in a single source shared by TS and CSS', () => {
    // 时长若两处各写一份会漂移：TS 常量注入 CSS 变量，关键帧只消费该变量。
    expect(revealSourceLineSource).toContain("'--adl-md-flash-duration'");
    expect(revealSourceLineSource).toContain('setProperty(FLASH_DURATION_VAR');
    expect(markdownPreviewCss).toContain('var(--adl-md-flash-duration');
  });

  it('does not declare a preview column width that the surface fill rule would override', () => {
    // 预存矛盾：`.adl-tool-editor__surface > div:not(...)` 以更高特异性把预览列强制为 100% 宽，
    // 故 `.adl-markdown-preview` 不能再声明 max-width/margin:auto（声明只会与实际生效值冲突）。
    expect(markdownPreviewCss).not.toContain('width: min(100%, 920px)');
  });
});
