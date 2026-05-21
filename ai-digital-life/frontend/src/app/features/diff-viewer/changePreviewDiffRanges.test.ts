import { describe, expect, it } from "vitest";

import {
  computePreviewDiffRanges,
  computePreviewDiffVisualRanges
} from "./changePreviewDiffRanges";

describe("computePreviewDiffRanges", () => {
  it("marks every current line as inserted for an untracked file", () => {
    expect(computePreviewDiffRanges("", "a\nb\nc")).toEqual([
      { startLine: 1, endLine: 3, type: "insert" }
    ]);
  });

  it("marks a deleted file at the first modified-side line", () => {
    expect(computePreviewDiffRanges("a\nb", "")).toEqual([
      { startLine: 1, endLine: 1, type: "delete" }
    ]);
  });

  it("keeps separated changed blocks distinct", () => {
    expect(computePreviewDiffRanges("a\nb\nc\nd", "a\nB\nc\nD")).toEqual([
      { startLine: 2, endLine: 2, type: "insert" },
      { startLine: 2, endLine: 2, type: "delete" },
      { startLine: 4, endLine: 4, type: "insert" },
      { startLine: 4, endLine: 4, type: "delete" }
    ]);
  });

  it("groups adjacent inserted lines", () => {
    expect(computePreviewDiffRanges("a\nb", "a\nc\nd")).toEqual([
      { startLine: 1, endLine: 1, type: "insert" },
      { startLine: 2, endLine: 3, type: "insert" }
    ]);
  });
});

describe("computePreviewDiffVisualRanges", () => {
  it("assigns strong tone when both insert and delete exist in same block", () => {
    const ranges = computePreviewDiffVisualRanges("a\nb", "A\nB");
    expect(ranges).toHaveLength(2);
    expect(ranges.every(r => r.tone === "strong")).toBe(true);
  });

  it("assigns block tone for large unchanged ranges", () => {
    const longContent = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join("\n");
    const changedContent = longContent + "\nchanged";
    const ranges = computePreviewDiffVisualRanges(longContent, changedContent);
    expect(ranges.some(r => r.tone === "block")).toBe(true);
  });
});
