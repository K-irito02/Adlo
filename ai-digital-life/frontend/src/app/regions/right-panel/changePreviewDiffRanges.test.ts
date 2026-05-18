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
    expect(computePreviewDiffRanges("a\nd", "a\nb\nc\nd")).toEqual([
      { startLine: 2, endLine: 3, type: "insert" }
    ]);
  });

  it("keeps replacement insert and delete ranges visually distinct on the same modified line", () => {
    expect(computePreviewDiffVisualRanges("keep\nold value\nnext", "keep\nnew value\nnext")).toEqual([
      { startLine: 2, endLine: 2, type: "insert", tone: "strong", contentColumns: 9 },
      { startLine: 2, endLine: 2, type: "delete", tone: "strong", contentColumns: 9 }
    ]);
  });

  it("marks large inserted blocks with a deeper block tone", () => {
    const current = ["start", ...Array.from({ length: 8 }, (_, index) => `added ${index}`), "end"].join("\n");

    expect(computePreviewDiffVisualRanges("start\nend", current)).toEqual([
      { startLine: 2, endLine: 9, type: "insert", tone: "block", contentColumns: 7 }
    ]);
  });

});
