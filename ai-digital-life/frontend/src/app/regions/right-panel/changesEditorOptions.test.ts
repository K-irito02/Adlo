import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const changesPanelStateSource = readFileSync(new URL("../../../../src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelState.tsx", import.meta.url), "utf8");
const diffEditorSectionSource = readFileSync(new URL("../../../../src/app/regions/right-panel/panels/DiffEditorSection.tsx", import.meta.url), "utf8");

describe("changes preview editor options", () => {
  it("uses DiffViewer component instead of Monaco DiffEditor", () => {
    expect(diffEditorSectionSource).toContain("DiffViewer");
    expect(diffEditorSectionSource).toContain("from '../../../features/diff-viewer'");
    expect(diffEditorSectionSource).not.toContain("@monaco-editor/react");
  });

  it("uses the shared custom CodeMirror fold gutter marker and tooltip overlay", () => {
    const sideBySideSource = readFileSync(new URL("../../features/diff-viewer/SideBySideDiffViewer.tsx", import.meta.url), "utf8");

    expect(sideBySideSource).toContain("createFoldGutterExtension");
    expect(sideBySideSource).toContain("FoldTooltipOverlay");
    expect(sideBySideSource).not.toContain("foldGutter()");
  });

  it("uses simple dark/light theme string instead of Monaco theme constants", () => {
    expect(diffEditorSectionSource).toContain("changePreviewTheme");
    expect(diffEditorSectionSource).not.toContain("MONACO_THEME_DARK");
    expect(diffEditorSectionSource).not.toContain("MONACO_THEME_LIGHT");
  });

  it("uses EditorRef and DiffEditorRef types from shared types", () => {
    expect(changesPanelStateSource).toContain("EditorRef");
    expect(changesPanelStateSource).toContain("DiffEditorRef");
    expect(changesPanelStateSource).toContain("from '../../../../stores/types'");
  });

  it("uses sticky context helpers from CodeMirror stickyContext module", () => {
    const useStickyContextSource = readFileSync(new URL("./hooks/useStickyContext.ts", import.meta.url), "utf8");

    expect(useStickyContextSource).toContain("getVisibleStartLine");
    expect(useStickyContextSource).toContain("navigateToLine");
    expect(useStickyContextSource).toContain("from '../editor-support/stickyContext'");
  });

  it("passes readOnly, lineNumbers, wordWrap, and sideBySide as DiffViewer props", () => {
    expect(diffEditorSectionSource).toContain("readOnly={true}");
    expect(diffEditorSectionSource).toContain("lineNumbers={lineNumbersEnabled}");
    expect(diffEditorSectionSource).toContain("wordWrap={wordWrapEnabled}");
    expect(diffEditorSectionSource).toContain("sideBySide={diffSideBySide}");
  });

  it("expands unchanged diff sections before outline navigation", () => {
    expect(diffEditorSectionSource).toContain("collapseUnchanged={true}");
    expect(changesPanelStateSource).toContain("editor.revealLineInCenter");
  });
});
