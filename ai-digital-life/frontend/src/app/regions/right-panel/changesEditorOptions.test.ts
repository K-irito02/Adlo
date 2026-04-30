import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const changesPanelSource = readFileSync(new URL("../../../../src/app/regions/right-panel/ChangesPanel.tsx", import.meta.url), "utf8");

describe("changes preview editor options", () => {
  it("does not reserve extra gutter width when folding controls are disabled", () => {
    expect(changesPanelSource).toContain("folding: false");
    expect(changesPanelSource).toContain("showFoldingControls");
    expect(changesPanelSource).toContain('"never"');
    expect(changesPanelSource).toContain("lineNumbersMinChars: 6");
    expect(changesPanelSource).toContain("lineDecorationsWidth: 0");
  });

  it("only enables a VS Code-style minimap and visible scrollbar for inline preview", () => {
    expect(changesPanelSource).toContain("minimap:");
    expect(changesPanelSource).toContain("props.diffSideBySide");
    expect(changesPanelSource).toContain('side: "right"');
    expect(changesPanelSource).toContain('size: "fill"');
    expect(changesPanelSource).toContain('showSlider: "mouseover"');
    expect(changesPanelSource).toContain("renderCharacters: true");
    expect(changesPanelSource).toContain("maxColumn: 80");
    expect(changesPanelSource).toContain("scale: 1.5");
    expect(changesPanelSource).toContain("scrollbar:");
    expect(changesPanelSource).toContain('vertical: "visible"');
    expect(changesPanelSource).toContain("verticalScrollbarSize: 12");
  });

  it("configures minimap on modified editor via onMount handler", () => {
    expect(changesPanelSource).toContain("handleDiffEditorMount");
    expect(changesPanelSource).toContain("getModifiedEditor");
    expect(changesPanelSource).toContain("getOriginalEditor");
    expect(changesPanelSource).toContain("diffEditorOptions");
    expect(changesPanelSource).toContain('enabled: true');
    expect(changesPanelSource).toContain('side: "right"');
    expect(changesPanelSource).toContain("renderCharacters: true");
    expect(changesPanelSource).toContain("maxColumn: 80");
    expect(changesPanelSource).toContain("scale: 1.5");
  });
});
