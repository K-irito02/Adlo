import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const changesPanelSource = readFileSync(new URL("../../../../src/app/regions/right-panel/ChangesPanel.tsx", import.meta.url), "utf8");

describe("changes preview editor options", () => {
  it("uses DiffViewer component instead of Monaco DiffEditor", () => {
    expect(changesPanelSource).toContain("DiffViewer");
    expect(changesPanelSource).toContain("from \"./DiffViewer\"");
    expect(changesPanelSource).not.toContain("@monaco-editor/react");
  });

  it("passes CodeMirror extensions for minimap and folding", () => {
    expect(changesPanelSource).toContain("getMinimapExtension");
    expect(changesPanelSource).toContain("getFoldingTooltipExtension");
    expect(changesPanelSource).toContain("diffExtensions");
  });

  it("passes stable minimap scopes to change preview and diff editors", () => {
    expect(changesPanelSource).toContain("changes:${changePreview.path}:preview");
    expect(changesPanelSource).toContain("changes:${changePreview.path}:diff:${props.diffSideBySide ? \"side-by-side\" : \"inline\"}");
    expect(changesPanelSource).toContain("minimapScopeId={changePreviewDiffMinimapScopeId}");
  });

  it("passes minimap model to DiffViewer from preview diff model", () => {
    expect(changesPanelSource).toContain("computePreviewDiffMinimapModel");
    expect(changesPanelSource).toContain("minimapModel={changePreviewMinimapModel}");
    expect(changesPanelSource).toContain("onCollapsedUnchangedRangesChange={setCollapsedUnchangedDiffRanges}");
  });

  it("recomputes change preview minimap wrapping from the modified editor layout", () => {
    expect(changesPanelSource).toContain("estimateWrapColumn");
    expect(changesPanelSource).toContain("changePreviewWrapColumn");
    expect(changesPanelSource).toContain("wrapColumn: changePreviewWrapColumn");
  });

  it("uses simple dark/light theme string instead of Monaco theme constants", () => {
    expect(changesPanelSource).toContain("changePreviewTheme");
    expect(changesPanelSource).toContain('"dark"');
    expect(changesPanelSource).toContain('"light"');
    expect(changesPanelSource).not.toContain("MONACO_THEME_DARK");
    expect(changesPanelSource).not.toContain("MONACO_THEME_LIGHT");
  });

  it("uses EditorRef and DiffEditorRef types from shared types", () => {
    expect(changesPanelSource).toContain("EditorRef");
    expect(changesPanelSource).toContain("DiffEditorRef");
    expect(changesPanelSource).toContain("from \"../../types\"");
  });

  it("uses sticky context helpers from CodeMirror stickyContext module", () => {
    expect(changesPanelSource).toContain("getVisibleStartLine");
    expect(changesPanelSource).toContain("navigateToLine");
    expect(changesPanelSource).toContain("subscribeToEditor");
    expect(changesPanelSource).toContain("from \"./stickyContext\"");
  });

  it("passes readOnly, lineNumbers, wordWrap, and sideBySide as DiffViewer props", () => {
    expect(changesPanelSource).toContain("readOnly={true}");
    expect(changesPanelSource).toContain("lineNumbers={lineNumbersEnabled}");
    expect(changesPanelSource).toContain("wordWrap={wordWrapEnabled}");
    expect(changesPanelSource).toContain("sideBySide={props.diffSideBySide}");
  });

  it("expands unchanged diff sections before outline navigation", () => {
    expect(changesPanelSource).toContain("forceExpandUnchangedDiff");
    expect(changesPanelSource).toContain("pendingOutlineRevealLine");
    expect(changesPanelSource).toContain("collapseUnchanged={collapseUnchangedDiff}");
  });

  it("keeps minimap hidden ranges aligned with folded unchanged diff sections", () => {
    expect(changesPanelSource).toContain("collapsedUnchangedDiffRanges");
    expect(changesPanelSource).toContain("hiddenUnchangedRanges: collapseUnchangedDiff ? collapsedUnchangedDiffRanges : []");
    expect(changesPanelSource).toContain("const collapseUnchangedDiff = !forceExpandUnchangedDiff");
  });
});
