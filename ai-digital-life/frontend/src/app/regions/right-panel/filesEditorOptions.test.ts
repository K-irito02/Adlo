import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const filesPanelSource = readFileSync(new URL("../../../../src/app/regions/right-panel/FilesPanel.tsx", import.meta.url), "utf8");

describe("files panel editor options", () => {
  it("uses a VS Code-style minimap and visible scrollbar", () => {
    expect(filesPanelSource).toContain("minimap:");
    expect(filesPanelSource).toContain("enabled: true");
    expect(filesPanelSource).toContain('side: "right"');
    expect(filesPanelSource).toContain('size: "fill"');
    expect(filesPanelSource).toContain('showSlider: "mouseover"');
    expect(filesPanelSource).toContain("renderCharacters: true");
    expect(filesPanelSource).toContain("maxColumn: 80");
    expect(filesPanelSource).toContain("scale: 1.5");
    expect(filesPanelSource).toContain("scrollbar:");
    expect(filesPanelSource).toContain('vertical: "visible"');
    expect(filesPanelSource).toContain("verticalScrollbarSize: 12");
  });
});
