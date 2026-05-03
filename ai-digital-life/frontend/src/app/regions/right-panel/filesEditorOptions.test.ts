import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const filesPanelSource = readFileSync(new URL("../../../../src/app/regions/right-panel/FilesPanel.tsx", import.meta.url), "utf8");

describe("files panel editor options", () => {
  it("uses a VS Code-style minimap while hiding the standard vertical scrollbar", () => {
    expect(filesPanelSource).toContain("minimap:");
    expect(filesPanelSource).toContain("enabled: true");
    expect(filesPanelSource).toContain('side: "right"');
    expect(filesPanelSource).toContain("showSlider: ms.showSlider");
    expect(filesPanelSource).toContain("size: ms.size");
    expect(filesPanelSource).toContain("renderCharacters: ms.renderCharacters");
    expect(filesPanelSource).toContain("maxColumn: 80");
    expect(filesPanelSource).toContain("scale: ms.scale");
    expect(filesPanelSource).toContain("scrollbar:");
    expect(filesPanelSource).toContain('vertical: "hidden"');
    expect(filesPanelSource).toContain("verticalScrollbarSize: 0");
  });
});
