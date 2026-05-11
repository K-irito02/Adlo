import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const filesPanelSource = readFileSync(new URL("../../../../src/app/regions/right-panel/FilesPanel.tsx", import.meta.url), "utf8");

describe("files panel editor options", () => {
  it("uses CodeMirror editor with minimap extension", () => {
    expect(filesPanelSource).toContain("CodeEditor");
    expect(filesPanelSource).toContain("getMinimapExtension");
    expect(filesPanelSource).toContain("getAgentDecorationExtensions");
    expect(filesPanelSource).toContain("getFoldingTooltipExtension");
  });

  it("passes a complete minimap model and drag callback to file diffs", () => {
    expect(filesPanelSource).toContain("fileDiffMinimapModel");
    expect(filesPanelSource).toContain("onMinimapDragStart={handleFileDiffMinimapDragStart}");
    expect(filesPanelSource).toContain("setFileDiffMinimapExpandedUnchanged(true)");
  });

  it("recomputes file diff minimap wrapping from the active editor layout", () => {
    expect(filesPanelSource).toContain("estimateWrapColumn");
    expect(filesPanelSource).toContain("fileDiffWrapColumn");
    expect(filesPanelSource).toContain("wrapColumn: fileDiffWrapColumn");
  });

  it("passes stable minimap scopes to file editors and file diffs", () => {
    expect(filesPanelSource).toContain("files:${selectedFilePath}:editor");
    expect(filesPanelSource).toContain("files:${selectedFilePath}:diff");
    expect(filesPanelSource).toContain("minimapScopeId={fileDiffMinimapScopeId}");
  });

  it("does not use Monaco editor", () => {
    expect(filesPanelSource).not.toContain("@monaco-editor/react");
    expect(filesPanelSource).not.toContain("minimap:");
    expect(filesPanelSource).not.toContain("scrollbar:");
  });
});
