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

  it("keeps only the minimap rail for inline preview while preserving side-by-side scrollbars", () => {
    expect(changesPanelSource).toContain("minimap:");
    expect(changesPanelSource).toContain("props.diffSideBySide");
    expect(changesPanelSource).toContain('side: "right"');
    expect(changesPanelSource).toContain('size: "fit"');
    expect(changesPanelSource).toContain('showSlider: "mouseover"');
    expect(changesPanelSource).toContain("renderCharacters: false");
    expect(changesPanelSource).toContain("maxColumn: 48");
    expect(changesPanelSource).toContain("scale: 1");
    expect(changesPanelSource).toContain("scrollbar:");
    expect(changesPanelSource).toContain('vertical: "hidden"');
    expect(changesPanelSource).toContain("verticalScrollbarSize: 0");
    expect(changesPanelSource).toContain('vertical: "auto"');
  });

  it("configures minimap on modified editor via onMount handler", () => {
    expect(changesPanelSource).toContain("handleDiffEditorMount");
    expect(changesPanelSource).toContain("getModifiedEditor");
    expect(changesPanelSource).toContain("getOriginalEditor");
    expect(changesPanelSource).toContain("inlineScrollbarOpts");
    expect(changesPanelSource).toContain("diffEditorOptions");
    expect(changesPanelSource).toContain('enabled: true');
    expect(changesPanelSource).toContain('side: "right"');
    expect(changesPanelSource).toContain('size: "fit"');
    expect(changesPanelSource).toContain("renderCharacters: false");
    expect(changesPanelSource).toContain("maxColumn: 48");
    expect(changesPanelSource).toContain("scale: 1");
    expect(changesPanelSource).toContain("verticalScrollbarSize: 0");
  });
});
