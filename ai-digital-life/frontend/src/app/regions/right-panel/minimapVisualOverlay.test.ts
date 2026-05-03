import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { computeMinimapDiffIndicatorStyle, computeMinimapVisualFrame, computeScrollRatio } from "./minimapVisualOverlay";

const minimapOverlaySource = readFileSync(
  new URL("../../../../src/app/regions/right-panel/minimapVisualOverlay.ts", import.meta.url),
  "utf8"
);
const regionsCss = readFileSync(new URL("../../../../src/styles/regions.css", import.meta.url), "utf8");

describe("computeMinimapVisualFrame", () => {
  it("scrollRatio 0 positions overlay at top", () => {
    expect(
      computeMinimapVisualFrame({
        minimapHeight: 600,
        scrollRatio: 0,
        visualHeight: 48
      })
    ).toEqual({ top: 0, height: 48 });
  });

  it("scrollRatio 1 positions overlay at bottom", () => {
    expect(
      computeMinimapVisualFrame({
        minimapHeight: 600,
        scrollRatio: 1,
        visualHeight: 48
      })
    ).toEqual({ top: 552, height: 48 });
  });

  it("scrollRatio 0.5 positions overlay at center", () => {
    expect(
      computeMinimapVisualFrame({
        minimapHeight: 600,
        scrollRatio: 0.5,
        visualHeight: 48
      })
    ).toEqual({ top: 276, height: 48 });
  });

  it("shrinks height when minimap is smaller than visual size", () => {
    expect(
      computeMinimapVisualFrame({
        minimapHeight: 30,
        scrollRatio: 0.5,
        visualHeight: 48
      })
    ).toEqual({ top: 0, height: 30 });
  });

  it("clamps scrollRatio to [0, 1]", () => {
    const over = computeMinimapVisualFrame({
      minimapHeight: 600,
      scrollRatio: 1.5,
      visualHeight: 48
    });
    expect(over.top).toBe(552);

    const under = computeMinimapVisualFrame({
      minimapHeight: 600,
      scrollRatio: -0.5,
      visualHeight: 48
    });
    expect(under.top).toBe(0);
  });

  it("returns zero frame when minimap height is zero", () => {
    expect(
      computeMinimapVisualFrame({
        minimapHeight: 0,
        scrollRatio: 0.5,
        visualHeight: 48
      })
    ).toEqual({ top: 0, height: 0 });
  });
});

describe("computeScrollRatio", () => {
  it("returns 0 when no scrollable content", () => {
    expect(
      computeScrollRatio({ scrollTop: 0, scrollHeight: 500, clientHeight: 500 })
    ).toBe(0);
  });

  it("returns 1 at bottom of document", () => {
    expect(
      computeScrollRatio({ scrollTop: 1000, scrollHeight: 2000, clientHeight: 1000 })
    ).toBe(1);
  });

  it("returns 0.5 at middle of document", () => {
    expect(
      computeScrollRatio({ scrollTop: 500, scrollHeight: 2000, clientHeight: 1000 })
    ).toBe(0.5);
  });

  it("clamps negative scrollTop to 0", () => {
    expect(
      computeScrollRatio({ scrollTop: -10, scrollHeight: 2000, clientHeight: 1000 })
    ).toBe(0);
  });

  it("returns 0 when content is shorter than viewport", () => {
    expect(
      computeScrollRatio({ scrollTop: 0, scrollHeight: 200, clientHeight: 500 })
    ).toBe(0);
  });
});

describe("changes minimap diff indicators", () => {
  it("sizes diff indicators to changed content columns instead of the full minimap width", () => {
    expect(
      computeMinimapDiffIndicatorStyle({
        range: { startLine: 10, endLine: 10, type: "insert", tone: "strong", contentColumns: 20 },
        totalLines: 100,
        minimapHeight: 500,
        minimapWidth: 84,
        maxColumn: 80
      })
    ).toEqual({ top: 45, height: 5, left: 4, width: 19.25 });
  });

  it("caps diff indicators at the available minimap width", () => {
    expect(
      computeMinimapDiffIndicatorStyle({
        range: { startLine: 1, endLine: 1, type: "delete", tone: "base", contentColumns: 200 },
        totalLines: 10,
        minimapHeight: 100,
        minimapWidth: 84,
        maxColumn: 80
      })?.width
    ).toBe(77);
  });

  it("keeps diff indicators inset from the minimap left edge", () => {
    const layout = computeMinimapDiffIndicatorStyle({
      range: { startLine: 1, endLine: 1, type: "insert", tone: "base", contentColumns: 8 },
      totalLines: 20,
      minimapHeight: 100,
      minimapWidth: 84,
      maxColumn: 80
    });

    expect(layout?.left).toBeGreaterThan(0);
    expect((layout?.left ?? 0) + (layout?.width ?? 0)).toBeLessThan(84);
  });

  it("renders diff indicators through theme-owned token classes below the slider", () => {
    expect(minimapOverlaySource).toContain("computeMinimapDiffIndicatorStyle");
    expect(minimapOverlaySource).toContain("computeDiffIndicatorMaxColumn");
    expect(minimapOverlaySource).toContain("const maxColumn = computeDiffIndicatorMaxColumn(diffRanges);");
    expect(minimapOverlaySource).toContain("indicator.style.width = `${layout.width}px`;");
    expect(minimapOverlaySource).not.toContain("left:0;right:0;");
    expect(regionsCss).toContain(".adl-minimap-diff-indicator {");
    expect(regionsCss).toContain("z-index: 1;");
    expect(regionsCss).toContain(".adl-minimap-diff-indicator--insert.adl-minimap-diff-indicator--strong");
    expect(regionsCss).toContain("linear-gradient(var(--editor-diff-insert-bg-strong), var(--editor-diff-insert-bg-strong)), var(--editor-bg);");
    expect(regionsCss).toContain(".adl-minimap-slider-visual");
    expect(regionsCss).toContain("z-index: 4;");
  });

  it("leaves the changes preview native minimap drawing layers under Monaco control", () => {
    expect(regionsCss).not.toContain(".editor.modified .minimap canvas,");
    expect(regionsCss).not.toContain(".editor.modified .minimap .minimap-decorations-layer {\n  display: block !important;");
    expect(regionsCss).toContain(".adl-minimap-diff-indicators {");
    expect(regionsCss).toContain("z-index: 1;");
    expect(regionsCss).toContain(".adl-minimap-slider-visual");
  });
});
