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

  it("uses minimapSettings for minimap and hides vertical scrollbar in all modes", () => {
    expect(changesPanelSource).toContain("minimap:");
    expect(changesPanelSource).toContain("props.diffSideBySide");
    expect(changesPanelSource).toContain('side: "right"');
    // Minimap options are driven by user minimapSettings, not hardcoded
    expect(changesPanelSource).toContain("minimapSettings.size");
    expect(changesPanelSource).toContain("minimapSettings.showSlider");
    expect(changesPanelSource).toContain("minimapSettings.renderCharacters");
    expect(changesPanelSource).toContain("minimapSettings.scale");
    expect(changesPanelSource).toContain("maxColumn: 80");
    // Scrollbar: vertical scrollbar is hidden in all modes (use minimap for navigation)
    expect(changesPanelSource).toContain("scrollbar:");
    expect(changesPanelSource).toContain('vertical: "hidden"');
    expect(changesPanelSource).toContain("verticalScrollbarSize: 0");
    // Should NOT have conditional scrollbar config for side-by-side mode
    expect(changesPanelSource).not.toContain("verticalScrollbarSize: 12");
  });

  it("configures minimap on modified editor via onMount handler", () => {
    expect(changesPanelSource).toContain("handleDiffEditorMount");
    expect(changesPanelSource).toContain("getModifiedEditor");
    expect(changesPanelSource).toContain("getOriginalEditor");
    expect(changesPanelSource).toContain("inlineScrollbarOpts");
    expect(changesPanelSource).toContain("diffEditorOptions");
    expect(changesPanelSource).toContain("enabled: true");
    expect(changesPanelSource).toContain('side: "right"');
    // applyMinimapToDiffEditor and applyMinimapSettings use user settings
    expect(changesPanelSource).toContain("s.size");
    expect(changesPanelSource).toContain("s.showSlider");
    expect(changesPanelSource).toContain("s.renderCharacters");
    expect(changesPanelSource).toContain("s.scale");
    expect(changesPanelSource).toContain("maxColumn: 80");
    expect(changesPanelSource).toContain("verticalScrollbarSize: 0");
  });

  it("applies preview-owned line and minimap decorations before Monaco diff finishes asynchronously", () => {
    expect(changesPanelSource).toContain("computePreviewDiffVisualRanges");
    expect(changesPanelSource).toContain("deltaDecorations");
    expect(changesPanelSource).toContain("adl-inline-diff-line");
    expect(changesPanelSource).toContain("getMinimapPosition");
  });

  it("attaches custom minimap visual overlays for the shared right-side minimap", () => {
    expect(changesPanelSource).toContain("attachMinimapVisualOverlays");
    expect(changesPanelSource).toContain("getScrollState: () => {");
    expect(changesPanelSource).toContain("onSettingsChange:");
    expect(changesPanelSource).toContain("getSettings:");
  });
});
