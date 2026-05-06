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

  it("does not use Monaco editor", () => {
    expect(filesPanelSource).not.toContain("@monaco-editor/react");
    expect(filesPanelSource).not.toContain("minimap:");
    expect(filesPanelSource).not.toContain("scrollbar:");
  });
});
