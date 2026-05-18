import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const filesPanelSource = readFileSync(new URL("../../../../src/app/regions/right-panel/FilesPanel.tsx", import.meta.url), "utf8");

describe("files panel editor options", () => {
  it("uses CodeMirror editor with agent decoration extensions", () => {
    expect(filesPanelSource).toContain("CodeEditor");
    expect(filesPanelSource).toContain("getAgentDecorationExtensions");
  });

  it("uses the shared custom CodeMirror fold gutter marker and tooltip overlay", () => {
    const codeEditorSource = readFileSync(new URL("../../../../src/app/regions/right-panel/CodeEditor.tsx", import.meta.url), "utf8");

    expect(codeEditorSource).toContain("createFoldGutterExtension");
    expect(codeEditorSource).toContain("FoldTooltipOverlay");
    expect(codeEditorSource).not.toContain("foldGutter()");
  });

  it("computes diff wrapping from the active editor layout", () => {
    expect(filesPanelSource).toContain("estimateWrapColumn");
    expect(filesPanelSource).toContain("fileDiffWrapColumn");
  });

  it("passes collapseUnchanged to file diffs", () => {
    expect(filesPanelSource).toContain("collapseUnchanged");
  });

  it("does not use Monaco editor", () => {
    expect(filesPanelSource).not.toContain("@monaco-editor/react");
    expect(filesPanelSource).not.toContain("minimap:");
    expect(filesPanelSource).not.toContain("scrollbar:");
  });
});
