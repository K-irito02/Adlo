import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const changesPanelSource = readFileSync(new URL("../../../../src/app/regions/right-panel/ChangesPanel.tsx", import.meta.url), "utf8");

describe("changes preview editor options", () => {
  it("uses DiffViewer component instead of Monaco DiffEditor", () => {
    expect(changesPanelSource).toContain("DiffViewer");
    expect(changesPanelSource).toContain('from "../../features/diff-viewer"');
    expect(changesPanelSource).not.toContain("@monaco-editor/react");
  });

  it("uses the shared custom CodeMirror fold gutter marker and tooltip overlay", () => {
    const sideBySideSource = readFileSync(new URL("../../features/diff-viewer/SideBySideDiffViewer.tsx", import.meta.url), "utf8");

    expect(sideBySideSource).toContain("createFoldGutterExtension");
    expect(sideBySideSource).toContain("FoldTooltipOverlay");
    expect(sideBySideSource).not.toContain("foldGutter()");
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
    const useStickyContextSource = readFileSync(new URL("./hooks/useStickyContext.ts", import.meta.url), "utf8");

    expect(useStickyContextSource).toContain("getVisibleStartLine");
    expect(useStickyContextSource).toContain("navigateToLine");
    expect(useStickyContextSource).toContain("from \"../stickyContext\"");
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
});
