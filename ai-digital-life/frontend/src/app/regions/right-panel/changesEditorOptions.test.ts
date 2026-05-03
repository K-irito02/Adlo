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

  it("uses a native proportional minimap in inline preview while preserving side-by-side scrollbars", () => {
    expect(changesPanelSource).toContain("minimap:");
    expect(changesPanelSource).toContain("props.diffSideBySide");
    expect(changesPanelSource).toContain('side: "right"');
    expect(changesPanelSource).toContain('size: "proportional"');
    expect(changesPanelSource).toContain('showSlider: "always"');
    expect(changesPanelSource).toContain("renderCharacters: false");
    expect(changesPanelSource).toContain("maxColumn: 80");
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
    expect(changesPanelSource).toContain('size: "proportional"');
    expect(changesPanelSource).toContain('showSlider: "always"');
    expect(changesPanelSource).toContain("renderCharacters: false");
    expect(changesPanelSource).toContain("maxColumn: 80");
    expect(changesPanelSource).toContain("scale: 1");
    expect(changesPanelSource).toContain("verticalScrollbarSize: 0");
  });

  it("applies preview-owned line and minimap decorations before Monaco diff finishes asynchronously", () => {
    expect(changesPanelSource).toContain("computePreviewDiffVisualRanges");
    expect(changesPanelSource).toContain("deltaDecorations");
    expect(changesPanelSource).toContain("adl-inline-diff-line");
    expect(changesPanelSource).toContain("getMinimapPosition");
    expect(changesPanelSource).toContain("CHANGE_MINIMAP_DECORATION_COLORS");
    expect(changesPanelSource).toContain("minimap:");
  });

  it("keeps inline minimap drag refresh off the React state path", () => {
    expect(changesPanelSource).not.toContain("attachMinimapVisualOverlays");
    expect(changesPanelSource).not.toContain("setChangePreviewWrapColumn");
    expect(changesPanelSource).not.toContain("getScrollState: () => {");
    expect(changesPanelSource).not.toContain("new MutationObserver");
    expect(changesPanelSource).not.toContain("diffModeChange-");
  });
});
