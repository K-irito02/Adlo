import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cmThemeSource = readFileSync(new URL("../../../../src/app/regions/right-panel/cmTheme.ts", import.meta.url), "utf8");
const codeEditorSource = readFileSync(new URL("../../../../src/app/regions/right-panel/CodeEditor.tsx", import.meta.url), "utf8");
const diffViewerSource = readFileSync(new URL("../../../../src/app/regions/right-panel/DiffViewer.tsx", import.meta.url), "utf8");
const regionsCssSource = readFileSync(new URL("../../../../src/styles/regions.css", import.meta.url), "utf8");

function extractCssBlock(css: string, selector: string) {
  const normalizedCss = css.replace(/\r\n/g, "\n");
  const normalizedSelector = selector.replace(/\r\n/g, "\n");
  const start = normalizedCss.indexOf(normalizedSelector);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = normalizedCss.indexOf("\n}", start);
  expect(end).toBeGreaterThan(start);
  return normalizedCss.slice(start, end + 2);
}

describe("CodeMirror preview styling", () => {
  it("uses the custom theme as the only syntax highlight source", () => {
    expect(codeEditorSource).toContain("getThemeExtension(theme)");
    expect(diffViewerSource).toContain("getThemeExtension(theme)");
    expect(codeEditorSource).not.toContain("defaultHighlightStyle");
    expect(diffViewerSource).not.toContain("defaultHighlightStyle");
  });

  it("renders diff state with quiet line backgrounds instead of vertical status rails", () => {
    expect(cmThemeSource).toContain(".cm-deletedLine");
    expect(cmThemeSource).toContain(".cm-insertedLine");
    expect(diffViewerSource).toContain("gutter: true");
    expect(diffViewerSource).not.toContain("gutter: false");
    expect(cmThemeSource).not.toContain("inset 3px 0 0");
    expect(regionsCssSource).not.toContain("inset 3px 0 0");
  });

  it("keeps CodeMirror editor and diff surfaces independent from legacy Monaco selectors", () => {
    expect(regionsCssSource).toContain(".adl-cm-diff-viewer .cm-editor");
    expect(regionsCssSource).toContain(".adl-markdown-preview .adl-md-code-header + pre.hljs");
    expect(regionsCssSource).not.toContain(".monaco-diff-editor");
    expect(regionsCssSource).not.toContain(".monaco-editor");
  });

  it("keeps agent annotations in the content area without an extra gutter column", () => {
    expect(regionsCssSource).not.toContain(".adl-tool-editor .adl-agent-gutter");
    expect(regionsCssSource).not.toContain(".adl-agent-gutter-marker");
    expect(cmThemeSource).not.toContain("AGENT_GUTTER_INSERT_CLASS");
    expect(cmThemeSource).toContain('borderRight: "1px solid var(--border-subtle)"');
    expect(cmThemeSource).toContain('paddingRight: "0"');
    expect(cmThemeSource).toContain('outline: "none"');
  });

  it("anchors the CodeMirror minimap to the editor surface while preserving wheel scrolling", () => {
    const minimapCanvasBlock = extractCssBlock(regionsCssSource, ".adl-cm-minimap-canvas {\n");
    const minimapSliderBlock = extractCssBlock(regionsCssSource, ".adl-cm-minimap-slider {\n");

    expect(regionsCssSource).toContain(".adl-cm-minimap");
    expect(regionsCssSource).toContain("right: 0;");
    expect(extractCssBlock(regionsCssSource, ".adl-cm-minimap {\n")).toContain("position: fixed;");
    expect(minimapCanvasBlock).toContain("position: absolute;");
    expect(minimapCanvasBlock).toContain("inset: 0;");
    expect(minimapSliderBlock).toContain("box-sizing: border-box;");
    expect(minimapSliderBlock).toContain("z-index: 1;");
    expect(minimapSliderBlock).toContain("var(--accent) 6%");
    expect(minimapSliderBlock).not.toContain("rgba(120, 120, 120, 0.25)");
    expect(extractCssBlock(regionsCssSource, ".adl-tool-panel {\n")).toContain("min-width: 0;");
    expect(extractCssBlock(regionsCssSource, ".adl-tool-panel {\n")).toContain("overflow: hidden;");
    expect(extractCssBlock(regionsCssSource, ".adl-tool-editor {\n  --adl-editor-minimap-width")).toContain("max-width: 100%;");
    expect(extractCssBlock(regionsCssSource, ".adl-tool-editor {\n  --adl-editor-minimap-width")).toContain("overflow: hidden;");
    expect(extractCssBlock(regionsCssSource, ".adl-tool-editor__surface > div:not(.adl-sticky-context) {\n")).toContain("width: 100%;");
    expect(extractCssBlock(regionsCssSource, ".adl-tool-editor__surface {\n")).toContain("max-width: 100%;");
    expect(extractCssBlock(regionsCssSource, ".adl-cm-diff-viewer {\n")).toContain("width: 100%;");
    expect(extractCssBlock(regionsCssSource, ".adl-cm-diff-viewer {\n")).toContain("overflow: hidden;");
    expect(regionsCssSource).toContain("scrollbar-width: none;");
    expect(regionsCssSource).toContain("overflow-y: auto !important;");
    expect(regionsCssSource).toContain(".adl-cm-editor .cm-scroller::-webkit-scrollbar");
    expect(extractCssBlock(regionsCssSource, ".adl-cm-editor .cm-scroller,\n.adl-cm-diff-viewer .cm-scroller")).not.toContain("overflow-y: hidden");
  });

  it("keeps the app-owned standard scrollbar visible and context-menu capable", () => {
    const standardBlock = extractCssBlock(regionsCssSource, ".adl-cm-minimap--standard {\n");
    const standardSliderBlock = extractCssBlock(regionsCssSource, ".adl-cm-minimap--standard .adl-cm-minimap-slider {\n");

    expect(standardBlock).toContain("width: var(--adl-cm-standard-scrollbar-width");
    expect(standardBlock).not.toContain("display: none");
    expect(standardSliderBlock).toContain("left:");
    expect(standardSliderBlock).toContain("right:");
    expect(regionsCssSource).toContain(".adl-cm-minimap--standard .adl-cm-minimap-canvas");
    expect(regionsCssSource).toContain(".cm-mergeView.adl-cm-scroller--minimap-scrollbar .cm-scroller::-webkit-scrollbar");
    expect(regionsCssSource).toContain(".cm-mergeView.adl-cm-scroller--minimap-scrollbar .cm-scroller {\n  scrollbar-width: none;");
  });

  it("styles the scrollbar mode switcher like the shared segmented buttons and right-aligns checkmarks", () => {
    expect(regionsCssSource).toContain(".adl-cm-minimap-menu-segmented");
    expect(regionsCssSource).toContain('.adl-cm-minimap-menu-segmented__button[aria-pressed="true"]');
    expect(regionsCssSource).toContain(".adl-cm-minimap-menu-item__check");
    expect(regionsCssSource).not.toContain(".adl-cm-minimap-menu-item--checked::before");
  });

  it("keeps native scrollbars hidden while the app-owned minimap rail is active", () => {
    expect(regionsCssSource).toContain(".adl-cm-editor .cm-scroller.adl-cm-scroller--minimap-scrollbar::-webkit-scrollbar");
    expect(regionsCssSource).toContain(".adl-cm-diff-viewer--side-by-side .cm-mergeView.adl-cm-scroller--minimap-scrollbar::-webkit-scrollbar");
    expect(regionsCssSource).toContain(".adl-cm-scroller--minimap-scrollbar {\n  scrollbar-width: none;");
  });

  it("keeps diff gutter rows vertically aligned with content rows", () => {
    const contentBlock = extractCssBlock(regionsCssSource, ".adl-cm-editor .cm-content,\n.adl-cm-diff-viewer .cm-content {\n");
    const guttersBlock = extractCssBlock(regionsCssSource, ".adl-cm-editor .cm-gutters,\n.adl-cm-diff-viewer .cm-gutters {\n");
    const gutterElementBlock = extractCssBlock(regionsCssSource, ".adl-cm-editor .cm-gutterElement,\n.adl-cm-diff-viewer .cm-gutterElement {\n");

    expect(contentBlock).toContain("padding-top: var(--space-2);");
    expect(contentBlock).toContain("padding-bottom: 25vh;");
    expect(guttersBlock).not.toContain("padding-top:");
    expect(gutterElementBlock).toContain("line-height: 1.65;");
  });

  it("centers fold gutter icons vertically with line numbers", () => {
    expect(extractCssBlock(regionsCssSource, ".adl-cm-editor .cm-foldGutter .cm-gutterElement span,\n.adl-cm-diff-viewer .cm-foldGutter .cm-gutterElement span {\n")).toContain("line-height: 1.65;");
    expect(extractCssBlock(regionsCssSource, ".adl-cm-editor .cm-foldGutter .cm-gutterElement,\n.adl-cm-diff-viewer .cm-foldGutter .cm-gutterElement {\n")).toContain("justify-content: center;");
  });

  it("provides a draggable resizer between side-by-side diff panes", () => {
    const resizerBlock = extractCssBlock(regionsCssSource, ".adl-cm-diff-viewer .adl-cm-diff-resizer {\n");
    expect(resizerBlock).toContain("cursor: col-resize;");
    expect(resizerBlock).toContain("flex: none;");
    expect(resizerBlock).toContain("width: 6px;");
    expect(regionsCssSource).toContain(".adl-cm-diff-resizer--dragging");
  });

  it("does not reserve minimap space in side-by-side diff panes", () => {
    expect(regionsCssSource).toContain(".adl-cm-diff-viewer--side-by-side .cm-mergeViewEditors > .cm-editor .cm-scroller");
    expect(regionsCssSource).toContain("padding-right: 0;");
  });

  it("keeps side-by-side diffs on the shared MergeView scroll container with independent horizontal scroll", () => {
    expect(regionsCssSource).toContain(".adl-cm-diff-viewer--side-by-side .cm-mergeView .cm-scroller");
    expect(extractCssBlock(regionsCssSource, ".adl-cm-diff-viewer--side-by-side .cm-mergeView .cm-scroller")).toContain("overflow: auto !important;");
    expect(extractCssBlock(regionsCssSource, ".adl-cm-diff-viewer--side-by-side .cm-mergeView {\n")).toContain("overflow: visible;");
    expect(extractCssBlock(regionsCssSource, ".adl-cm-diff-viewer--side-by-side .cm-mergeViewEditors {\n")).toContain("height: auto;");
  });
});
