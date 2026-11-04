// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const cmThemeSource = readFileSync(
  new URL('../../features/editor/cmTheme.ts', import.meta.url),
  'utf8',
);
const codeEditorSource = readFileSync(
  new URL('../../features/editor/CodeEditor.tsx', import.meta.url),
  'utf8',
);
const diffViewerSource = readFileSync(
  new URL('../../features/diff-viewer/DiffViewer.tsx', import.meta.url),
  'utf8',
);
const sharedExtensionsSource = readFileSync(
  new URL('../../features/diff-viewer/sharedExtensions.ts', import.meta.url),
  'utf8',
);
const diffViewerUtilsSource = readFileSync(
  new URL('../../features/diff-viewer/diffViewerUtils.ts', import.meta.url),
  'utf8',
);
const gitVisCssSource = readFileSync(
  new URL('../../../../src/styles/regions/rightpanel/git-visualization.css', import.meta.url),
  'utf8',
);
const sideBySideSource = readFileSync(
  new URL('../../features/diff-viewer/SideBySideDiffViewer.tsx', import.meta.url),
  'utf8',
);
const chunkButtonSource = readFileSync(
  new URL('../../features/editor/cmLintHighlights.ts', import.meta.url),
  'utf8',
);
const regionsCssSource = [
  'files-panel-core.css',
  'files-panel-list.css',
  'files-panel.css',
  'files-navigator.css',
  'changes-panel.css',
  'editor-surface.css',
  'editor-content.css',
  'markdown-preview.css',
  'diff-viewer.css',
  'diff-inline.css',
  'diff-side-by-side.css',
  'browser-webview.css',
  'terminal-panel.css',
]
  .map((f) =>
    readFileSync(
      new URL(`../../../../src/styles/regions/rightpanel/${f}`, import.meta.url),
      'utf8',
    ),
  )
  .join('\n');

/** 仅 diff 视图三件套：竖轨禁令只针对 diff 行背景（落点高亮覆盖层
 * `adl-reveal-highlight` 合法使用 inset 高亮，不在此禁令内）。 */
const diffCssSource = ['diff-viewer.css', 'diff-inline.css', 'diff-side-by-side.css']
  .map((f) =>
    readFileSync(
      new URL(`../../../../src/styles/regions/rightpanel/${f}`, import.meta.url),
      'utf8',
    ),
  )
  .join('\n');

function extractCssBlock(css: string, selector: string) {
  const normalizedCss = css.replace(/\r\n/g, '\n');
  const normalizedSelector = selector.replace(/\r\n/g, '\n');
  const start = normalizedCss.indexOf(normalizedSelector);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = normalizedCss.indexOf('\n}', start);
  expect(end).toBeGreaterThan(start);
  return normalizedCss.slice(start, end + 2);
}

describe('CodeMirror preview styling', () => {
  it('uses oneDark as base and custom theme for both mode overrides', () => {
    expect(codeEditorSource).toContain('theme="dark"');
    expect(codeEditorSource).toContain('getThemeExtension(theme)');
    expect(sharedExtensionsSource).toContain('getThemeExtension');
  });

  it('renders diff state with quiet line backgrounds instead of vertical status rails', () => {
    expect(cmThemeSource).toContain('.cm-deletedLine');
    expect(cmThemeSource).toContain('.cm-insertedLine');
    // 方案A：常规文件仍开合并标记 gutter，重型（>1M 字符）才关闭以保流畅。
    expect(sideBySideSource).toContain('gutter: !isHeavy');
    expect(diffViewerSource).not.toContain('gutter: false');
    expect(cmThemeSource).not.toContain('inset 3px 0 0');
    expect(diffCssSource).not.toContain('inset 3px 0 0');
  });

  it('keeps CodeMirror editor and diff surfaces independent from legacy Monaco selectors', () => {
    expect(regionsCssSource).toContain('.adl-cm-diff-viewer .cm-editor');
    expect(regionsCssSource).toContain(
      '.adl-markdown-preview .adl-md-code-header + pre.adl-md-code',
    );
    expect(regionsCssSource).not.toContain('.monaco-diff-editor');
    expect(regionsCssSource).not.toContain('.monaco-editor');
  });

  it('keeps preset menu labels single-line with ellipsis beside the check icon', () => {
    const labelBlock = extractCssBlock(gitVisCssSource, '.adl-git-vis__preset-item-label {\n');
    expect(labelBlock).toContain('min-width: 0;');
    expect(labelBlock).toContain('white-space: nowrap;');
    expect(labelBlock).toContain('overflow: hidden;');
    expect(labelBlock).toContain('text-overflow: ellipsis;');
  });

  it('keeps the markdown theme var-driven: six var blocks, parameterized body, no hardcoded theme colors', () => {
    const varsSource = readFileSync(
      new URL('../../../../src/styles/vendor/markdown-theme-vars.css', import.meta.url),
      'utf8',
    );
    for (const id of [
      'light',
      'light-colorblind',
      'dark',
      'dark-dimmed',
      'dark-high-contrast',
      'dark-colorblind',
    ]) {
      expect(varsSource).toContain(`.adl-markdown-preview[data-md-theme="${id}"]`);
    }
    // 规则体只用变量，不直接写主题色
    expect(varsSource).toContain('.markdown-body h1 {');
    expect(varsSource).toContain('color: var(--md-fg-default);');
    expect(varsSource).toContain('background-color: var(--md-canvas-default);');
    expect(varsSource).toContain('color-scheme: var(--md-color-scheme);');
    // N3：高对比覆盖必须是同元素限定（后代组合恒不命中，overrideSelector 退化即 fail）；
    // 计数精确断言：恰好 4 条覆盖规则，不多不少（防静默增删）。
    const overrideSelectors =
      varsSource.match(/\.markdown-body\[data-md-theme="[^"]+"\] [^{]+\{/g) ?? [];
    expect(overrideSelectors).toHaveLength(4);
    for (const sel of [
      '.markdown-body[data-md-theme="dark-high-contrast"] h1',
      '.markdown-body[data-md-theme="dark-high-contrast"] h2',
      '.markdown-body[data-md-theme="dark-high-contrast"] hr',
      '.markdown-body[data-md-theme="dark-high-contrast"] table tr',
    ]) {
      expect(varsSource).toContain(`${sel} {`);
    }
  });

  it('keeps the clipboard zoom hook above official typography (F1 regression guard)', () => {
    const zoomBlock = extractCssBlock(regionsCssSource, '.adl-markdown-preview.markdown-body {\n');
    expect(zoomBlock).toContain('font-size: var(--text-base, 16px);');
  });

  it('keeps agent annotations in the content area without an extra gutter column', () => {
    expect(regionsCssSource).not.toContain('.adl-tool-editor .adl-agent-gutter');
    expect(regionsCssSource).not.toContain('.adl-agent-gutter-marker');
    expect(cmThemeSource).not.toContain('AGENT_GUTTER_INSERT_CLASS');
    expect(cmThemeSource).toContain("paddingRight: '0'");
    expect(cmThemeSource).toContain("outline: 'none'");
  });

  it('keeps diff gutter rows vertically aligned with content rows', () => {
    const contentBlock = extractCssBlock(
      regionsCssSource,
      '.adl-cm-editor .cm-content,\n.adl-cm-diff-viewer .cm-content {\n',
    );
    const guttersBlock = extractCssBlock(
      regionsCssSource,
      '.adl-cm-editor .cm-gutters,\n.adl-cm-diff-viewer .cm-gutters {\n',
    );
    const gutterElementBlock = extractCssBlock(
      regionsCssSource,
      '.adl-cm-editor .cm-gutterElement,\n.adl-cm-diff-viewer .cm-gutterElement {\n',
    );

    expect(contentBlock).toContain('padding-top: 0;');
    expect(contentBlock).toContain('padding-bottom: 25vh;');
    expect(guttersBlock).toContain('padding-top: 0;');
    expect(gutterElementBlock).toContain('line-height: 1.65;');
  });

  it('centers fold gutter icons vertically with line numbers', () => {
    const foldIconBlock = extractCssBlock(
      regionsCssSource,
      '.adl-cm-editor .cm-foldGutter .cm-gutterElement span,\n.adl-cm-diff-viewer .cm-foldGutter .cm-gutterElement span {\n',
    );
    const foldMarkerBlock = extractCssBlock(regionsCssSource, '.adl-cm-fold-marker {\n');
    const openMarkerBlock = extractCssBlock(regionsCssSource, '.adl-cm-fold-marker--open {\n');
    const closedMarkerBlock = extractCssBlock(regionsCssSource, '.adl-cm-fold-marker--closed {\n');

    expect(foldIconBlock).toContain('line-height: 1;');
    expect(foldIconBlock).toContain('font-size: 0;');
    expect(foldMarkerBlock).toContain('position: relative;');
    expect(foldMarkerBlock).toContain('width: 8px;');
    expect(foldMarkerBlock).toContain('height: 8px;');
    expect(regionsCssSource).toContain('.adl-cm-fold-marker::before');
    expect(regionsCssSource).toContain('.adl-cm-fold-marker::after');
    expect(openMarkerBlock).toContain('translateY(0)');
    expect(regionsCssSource).toContain('.adl-cm-fold-marker--open::before');
    expect(regionsCssSource).toContain('.adl-cm-fold-marker--open::after');
    expect(closedMarkerBlock).toContain('translateX(-1px)');
    expect(regionsCssSource).toContain('.adl-cm-fold-marker--closed::before');
    expect(regionsCssSource).toContain('.adl-cm-fold-marker--closed::after');
    expect(regionsCssSource).toContain('rotate(-45deg)');
    expect(
      extractCssBlock(
        regionsCssSource,
        '.adl-cm-editor .cm-foldGutter .cm-gutterElement,\n.adl-cm-diff-viewer .cm-foldGutter .cm-gutterElement {\n',
      ),
    ).toContain('justify-content: center;');
  });

  it('provides a draggable resizer between side-by-side diff panes', () => {
    const resizerBlock = extractCssBlock(
      regionsCssSource,
      '.adl-cm-diff-viewer .adl-cm-diff-resizer {\n',
    );
    expect(resizerBlock).toContain('cursor: col-resize;');
    expect(resizerBlock).toContain('flex: none;');
    expect(resizerBlock).toContain('width: 8px;');
    expect(regionsCssSource).toContain('.adl-cm-diff-resizer--dragging');
  });

  it('does not reserve minimap space in side-by-side diff panes', () => {
    expect(regionsCssSource).toContain(
      '.adl-cm-diff-viewer--side-by-side .cm-mergeViewEditors > .cm-editor .cm-scroller',
    );
    expect(regionsCssSource).toContain('padding-right: 0;');
  });

  it('keeps side-by-side diffs on individual editor scroll containers', () => {
    expect(
      extractCssBlock(
        regionsCssSource,
        '.adl-cm-diff-viewer--side-by-side .cm-mergeView .cm-scroller {\n',
      ),
    ).toContain('overflow: auto !important;');
    expect(regionsCssSource).toContain('::-webkit-scrollbar:horizontal');
    expect(
      extractCssBlock(
        regionsCssSource,
        '.adl-cm-diff-viewer--side-by-side .cm-mergeView .cm-scroller.adl-cm-scroller--no-hscroll {\n',
      ),
    ).toContain('overflow: auto !important;');
    expect(regionsCssSource).toContain('scrollbar-width: none');
    expect(
      extractCssBlock(
        regionsCssSource,
        '.adl-cm-diff-viewer--side-by-side .cm-mergeViewEditors > .cm-mergeViewEditor {\n',
      ),
    ).toContain('overflow: hidden;');
    expect(regionsCssSource).not.toContain('.cm-mergeView .adl-cm-hscroll');
    expect(
      extractCssBlock(
        regionsCssSource,
        '.adl-cm-diff-viewer--side-by-side .cm-mergeViewEditors > .cm-mergeViewEditor:last-child {\n',
      ),
    ).toContain('margin-left: 0;');
  });

  it('pins no-wrap inline merge controls to the visible editor edge while horizontal scrolling', () => {
    const noWrapButtonsBlock = extractCssBlock(
      regionsCssSource,
      '.adl-cm-no-word-wrap .adl-cm-diff-viewer--inline .cm-deletedChunk .cm-chunkButtons {\n',
    );
    const deletedChunkBlock = extractCssBlock(
      regionsCssSource,
      '.adl-cm-no-word-wrap .adl-cm-diff-viewer--inline .cm-deletedChunk {\n',
    );

    expect(chunkButtonSource).toContain('positionChunkButtons');
    expect(chunkButtonSource).toContain('right');
    expect(chunkButtonSource).toContain('inset-inline-end');
    expect(chunkButtonSource).toContain('topOffset');
    expect(chunkButtonSource).toContain('lineHeight');
    expect(chunkButtonSource).toContain('chunkRect');
    expect(noWrapButtonsBlock).toContain('z-index: 20');
    expect(deletedChunkBlock).toContain('position: relative');
  });

  it('lets no-wrap editors create horizontal overflow only from actual line width', () => {
    const noWrapScrollerBlock = extractCssBlock(
      regionsCssSource,
      '.adl-cm-no-word-wrap .adl-cm-diff-viewer .cm-scroller,\n.adl-cm-no-word-wrap .adl-cm-editor .cm-scroller {\n',
    );
    const noWrapContentBlock = extractCssBlock(
      regionsCssSource,
      '.adl-cm-no-word-wrap .adl-cm-diff-viewer .cm-content,\n.adl-cm-no-word-wrap .adl-cm-editor .cm-content {\n',
    );

    expect(codeEditorSource).toContain('scrollLeftSyncExtension');
    expect(diffViewerUtilsSource).toContain('initScrollbarWidth');
    expect(noWrapScrollerBlock).toContain('overflow-x: hidden !important;');
    expect(noWrapScrollerBlock).toContain('padding-right: 0;');
    expect(regionsCssSource).not.toContain('--adl-editor-minimap-width');
    expect(noWrapScrollerBlock).not.toContain('scrollbar-width:');
    expect(noWrapScrollerBlock).not.toContain('overflow-y:');
    expect(noWrapContentBlock).toContain('white-space: pre !important;');
    expect(noWrapContentBlock).toContain('min-width: max-content');
    expect(noWrapContentBlock).toContain('overflow: visible');
    expect(noWrapContentBlock).toContain('width: auto !important;');
    expect(noWrapContentBlock).toContain('max-width: none !important;');
    expect(noWrapContentBlock).toContain('padding-right: 24px;');
    expect(
      extractCssBlock(
        regionsCssSource,
        '.adl-cm-no-word-wrap .adl-cm-diff-viewer .cm-line,\n.adl-cm-no-word-wrap .adl-cm-editor .cm-line,\n.adl-cm-no-word-wrap .adl-cm-diff-viewer .cm-deletedChunk {\n',
      ),
    ).toContain('padding-right: 24px;');
    expect(regionsCssSource).toContain('.adl-cm-scroller--no-hscroll');
    expect(regionsCssSource).toContain('adl-cm-scroller--no-hscroll');
  });
});
