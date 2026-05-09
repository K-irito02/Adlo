import { describe, expect, it } from "vitest";

import {
  computeMinimapScrollTopFromPointer,
  computeMinimapRenderMetrics,
  computeMinimapSliderMetrics,
  getMinimapDiffSegmentsForLine,
  minimapHunksToDiffModel,
  type CmMinimapDiffModel,
} from "./cmMinimap";

describe("cm minimap geometry", () => {
  it("keeps the slider proportional to the visible scroll range", () => {
    expect(computeMinimapSliderMetrics({
      scrollTop: 200,
      scrollHeight: 1000,
      clientHeight: 250,
      trackHeight: 500,
    })).toEqual({
      visible: true,
      top: 100,
      height: 125,
    });
  });

  it("preserves the pointer offset while dragging the slider", () => {
    expect(computeMinimapScrollTopFromPointer({
      pointerY: 270,
      trackTop: 20,
      dragOffsetY: 50,
      scrollHeight: 1200,
      clientHeight: 300,
      trackHeight: 600,
      sliderHeight: 150,
    })).toBe(400);
  });

  it("does not stretch short documents to the full minimap height", () => {
    expect(computeMinimapRenderMetrics({
      lineCount: 5,
      containerHeight: 500,
      maxLineHeight: 2,
    })).toEqual({
      lineHeight: 2,
      renderHeight: 10,
    });
  });

  it("fits long documents into the available minimap height", () => {
    expect(computeMinimapRenderMetrics({
      lineCount: 1000,
      containerHeight: 500,
      maxLineHeight: 2,
    })).toEqual({
      lineHeight: 0.5,
      renderHeight: 500,
    });
  });
});

describe("cm minimap diff model", () => {
  it("keeps red and green segments on the same visual line", () => {
    const model: CmMinimapDiffModel = {
      totalLines: 3,
      lineColumns: [4, 14, 4],
      ranges: [
        { startLine: 2, endLine: 2, type: "insert", tone: "strong", contentColumns: 14 },
        { startLine: 2, endLine: 2, type: "delete", tone: "strong", contentColumns: 9 },
      ],
    };

    expect(getMinimapDiffSegmentsForLine(model, 2)).toEqual([
      { type: "delete", tone: "strong", contentColumns: 9, lane: 0, laneCount: 2 },
      { type: "insert", tone: "strong", contentColumns: 14, lane: 1, laneCount: 2 },
    ]);
  });

  it("converts legacy hunk decorations into a complete minimap model", () => {
    expect(minimapHunksToDiffModel([
      { startLine: 1, endLine: 2, changeKind: "added", decision: "pending", hunkId: "a" },
      { startLine: 4, endLine: 4, changeKind: "modified", decision: "pending", hunkId: "m" },
      { startLine: 5, endLine: 5, changeKind: "deleted", decision: "pending", hunkId: "d" },
    ], 8)).toEqual({
      totalLines: 8,
      lineColumns: undefined,
      ranges: [
        { startLine: 1, endLine: 2, type: "insert", tone: "base", contentColumns: 1 },
        { startLine: 4, endLine: 4, type: "insert", tone: "strong", contentColumns: 1 },
        { startLine: 4, endLine: 4, type: "delete", tone: "strong", contentColumns: 1 },
        { startLine: 5, endLine: 5, type: "delete", tone: "base", contentColumns: 1 },
      ],
    });
  });
});
