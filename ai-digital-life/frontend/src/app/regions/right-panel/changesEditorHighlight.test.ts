import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const changesPanelSource = readFileSync(
  new URL("../../../../src/app/regions/right-panel/ChangesPanel.tsx", import.meta.url),
  "utf8"
);
const themeCss = readFileSync(new URL("../../../../src/styles/themes.css", import.meta.url), "utf8");
const regionsCss = readFileSync(new URL("../../../../src/styles/regions.css", import.meta.url), "utf8");
const inlineDiffBackgroundSource = readFileSync(
  new URL("../../../../src/app/regions/right-panel/cmInlineDiffBackgrounds.ts", import.meta.url),
  "utf8"
);
const diffBlockLayerSource = readFileSync(
  new URL("../../../../src/app/regions/right-panel/cmDiffBlockLayer.ts", import.meta.url),
  "utf8"
);
const cmThemeSource = readFileSync(
  new URL("../../../../src/app/regions/right-panel/cmTheme.ts", import.meta.url),
  "utf8"
);
const agentDecorationsSource = readFileSync(
  new URL("../../../../src/app/regions/right-panel/agentDecorations.ts", import.meta.url),
  "utf8"
);
const diffViewerSource = readFileSync(
  new URL("../../../../src/app/regions/right-panel/DiffViewer.tsx", import.meta.url),
  "utf8"
);

function extractThemeSection(css: string, marker: string, nextMarker: string | null) {
  const start = css.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = nextMarker ? css.indexOf(nextMarker, start + marker.length) : css.length;
  expect(end).toBeGreaterThan(start);
  return css.slice(start, end);
}

describe("changes preview highlight theming", () => {
  it("uses accent-based find-match colors instead of warning yellow in both themes", () => {
    const lightTheme = extractThemeSection(themeCss, '[data-theme="light"] {', '[data-theme="dark"] {');
    const darkTheme = extractThemeSection(themeCss, '[data-theme="dark"] {', null);

    expect(lightTheme).toContain("--editor-findMatch: rgba(37, 99, 235, 0.18);");
    expect(lightTheme).toContain("--editor-findMatch-highlight: rgba(37, 99, 235, 0.1);");
    expect(lightTheme).not.toContain("--editor-findMatch: rgba(96, 165, 250, 0.2);");
    expect(lightTheme).not.toContain("--editor-findMatch: rgba(251, 191, 36, 0.24);");

    expect(darkTheme).toContain("--editor-findMatch: rgba(96, 165, 250, 0.2);");
    expect(darkTheme).toContain("--editor-findMatch-highlight: rgba(96, 165, 250, 0.12);");
    expect(darkTheme).not.toContain("--editor-findMatch: rgba(37, 99, 235, 0.18);");
    expect(darkTheme).not.toContain("--editor-findMatch: rgba(251, 191, 36, 0.24);");
  });

  it("preserves line-level diff backgrounds after border cleanup", () => {
    expect(themeCss).toContain("--editor-diff-insert-bg: rgba(22, 163, 74, 0.12);");
    expect(themeCss).toContain("--editor-diff-remove-bg: rgba(239, 68, 68, 0.12);");
    expect(themeCss).toContain("--editor-diff-insert-bg-strong: rgba(22, 163, 74, 0.18);");
    expect(themeCss).toContain("--editor-diff-remove-bg-strong: rgba(239, 68, 68, 0.18);");
    expect(themeCss).toContain("--editor-diff-insert-bg: rgba(74, 222, 128, 0.14);");
    expect(themeCss).toContain("--editor-diff-remove-bg: rgba(248, 113, 113, 0.14);");
    expect(themeCss).toContain("--editor-diff-insert-bg-strong: rgba(74, 222, 128, 0.2);");
    expect(themeCss).toContain("--editor-diff-remove-bg-strong: rgba(248, 113, 113, 0.2);");
  });

  it("uses CodeMirror agent decorations for diff range highlighting", () => {
    expect(changesPanelSource).toContain("computePreviewDiffVisualRanges");
    expect(changesPanelSource).toContain("applyAgentDecorations");
    expect(changesPanelSource).toContain("previewDiffRangesToAgentHunks");
    expect(changesPanelSource).toContain("getAgentDecorationExtensions");
  });

  it("uses CodeMirror inline diff backgrounds for visual diff emphasis", () => {
    expect(changesPanelSource).toContain("getInlineDiffBackgroundExtension");
    expect(changesPanelSource).toContain("applyInlineDiffChunks");
    expect(changesPanelSource).toContain("previewDiffRangesToChunks");
    expect(diffViewerSource).toContain("getDiffBlockLayerExtension()");
  });

  it("separates full-width diff block fills from content-width line fills", () => {
    expect(regionsCss).toContain("--adl-cm-diff-insert-block-bg: rgba(74, 222, 128, 0.06);");
    expect(regionsCss).toContain("--adl-cm-diff-insert-line-bg: rgba(74, 222, 128, 0.14);");
    expect(regionsCss).toContain("--adl-cm-diff-block-fill-outset: 100vw;");
    expect(regionsCss).toContain(".adl-cm-diff-block-layer-root {");
    expect(regionsCss).toContain(".adl-cm-diff-block-layer--insert {");
    expect(diffBlockLayerSource).toContain('this.layerDom.className = "adl-cm-diff-block-layer-root"');
    expect(diffBlockLayerSource).toContain("this.hostDom.appendChild(this.layerDom);");
    expect(diffBlockLayerSource).toContain('this.view.dom.closest<HTMLElement>(".adl-tool-editor__surface")');
    expect(diffBlockLayerSource).toContain('this.view.dom.closest<HTMLElement>(".adl-cm-diff-viewer--side-by-side")');
    expect(diffBlockLayerSource).toContain("this.layerDom.style.left = `${measure.layerLeft}px`;");
    expect(regionsCss).toContain("bottom: 0;");
    expect(regionsCss).toContain(":where(.adl-tool-editor__surface, .adl-cm-editor, .adl-cm-diff-viewer)");
    expect(regionsCss).toContain(".adl-cm-diff-viewer .cm-editor {\n  background: transparent !important;");
    expect(regionsCss).toContain(".adl-cm-diff-viewer .cm-scroller {\n  background: transparent !important;");
    expect(regionsCss).toContain("overflow: hidden;");
    expect(regionsCss).toContain("background: var(--adl-cm-diff-line-bg, transparent) !important;");
    expect(cmThemeSource).toContain('".cm-deletedLine": {');
    expect(cmThemeSource).toContain('backgroundColor: "transparent"');
    expect(inlineDiffBackgroundSource).not.toContain("Decoration.line({ class:");
    expect(inlineDiffBackgroundSource).toContain("Decoration.mark({ class: DIFF_INSERT_CLASS })");
    expect(agentDecorationsSource).toContain("Decoration.line({ class: getLineDecoClass(hunk) })");
    expect(agentDecorationsSource).toContain("Decoration.mark({ class: getContentDecoClass(hunk) })");
    expect(regionsCss).not.toContain("width: var(--adl-cm-diff-line-fill-width);");
  });

  it("keeps diff rows visually calm by avoiding active-line and selected-hunk overlay bands", () => {
    expect(regionsCss).toContain("--adl-cm-diff-line-vertical-fill: 0 -2px 0 0 var(--adl-cm-diff-line-bg), 0 2px 0 0 var(--adl-cm-diff-line-bg);");
    expect(regionsCss).toContain("isolation: isolate;");
    expect(regionsCss).toContain("box-decoration-break: clone;");
    expect(regionsCss).toContain("background-image: linear-gradient(");
    expect(regionsCss).toContain(".adl-cm-diff-viewer .cm-activeLine.cm-insertedLine");
    expect(regionsCss).toContain(".adl-cm-diff-viewer .cm-activeLine {");
    expect(regionsCss).toContain(".adl-cm-diff-viewer .cm-activeLine.adl-cm-agent-block-delete");
    expect(regionsCss).toContain("--adl-cm-selected-hunk-marker-width: 3px;");
    expect(regionsCss).toContain("box-shadow: inset var(--adl-cm-selected-hunk-marker-width) 0 0 var(--editor-current-hunk-ring) !important;");
  });

  it("does not contain any Monaco imports or references", () => {
    expect(changesPanelSource).not.toContain("@monaco-editor/react");
    expect(changesPanelSource).not.toContain("monacoTheme");
    expect(changesPanelSource).not.toContain("monacoTypes");
    expect(changesPanelSource).not.toContain("minimapVisualOverlay");
    expect(changesPanelSource).not.toContain("inlineMinimapLayout");
    expect(changesPanelSource).not.toContain("deltaDecorations");
    expect(changesPanelSource).not.toContain("from \"@monaco-editor/react\"");
    expect(changesPanelSource).not.toContain("handleMonacoBeforeMount");
    expect(changesPanelSource).not.toContain("MonacoEditorRef");
    expect(changesPanelSource).not.toContain("MonacoNamespace");
    expect(changesPanelSource).not.toContain("getMonacoFromWindow");
  });
});
