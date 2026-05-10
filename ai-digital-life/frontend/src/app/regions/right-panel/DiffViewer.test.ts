import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { buildCollapsedUnchangedRanges, computeSyncedScrollTop } from "./DiffViewer";

describe("DiffViewer scroll synchronization", () => {
  it("preserves scroll position by ratio when side-by-side panes have different heights", () => {
    expect(computeSyncedScrollTop({
      sourceScrollTop: 250,
      sourceScrollHeight: 1500,
      sourceClientHeight: 500,
      targetScrollHeight: 2500,
      targetClientHeight: 500,
    })).toBe(500);
  });

  it("keeps the target at the top when the source cannot scroll", () => {
    expect(computeSyncedScrollTop({
      sourceScrollTop: 100,
      sourceScrollHeight: 500,
      sourceClientHeight: 500,
      targetScrollHeight: 2500,
      targetClientHeight: 500,
    })).toBe(0);
  });

  it("builds collapsed unchanged ranges with merge-view margins applied", () => {
    const state = EditorState.create({
      doc: "line1\nline2\nline3\nline4\nline5\nchanged\nline7\nline8\nline9\nline10\nline11\nline12",
    });
    const chunks = [{
      fromB: state.doc.line(6).from,
      toB: state.doc.line(6).to,
    }] as unknown as Parameters<typeof buildCollapsedUnchangedRanges>[0]["chunks"];

    expect(buildCollapsedUnchangedRanges({
      chunks,
      doc: state.doc,
    })).toEqual([{ startLine: 9, endLine: 12 }]);
  });

  it("drops a collapsed range after the user expands it", () => {
    const state = EditorState.create({
      doc: "line1\nline2\nline3\nline4\nline5\nchanged\nline7\nline8\nline9\nline10\nline11\nline12",
    });
    const chunks = [{
      fromB: state.doc.line(6).from,
      toB: state.doc.line(6).to,
    }] as unknown as Parameters<typeof buildCollapsedUnchangedRanges>[0]["chunks"];

    expect(buildCollapsedUnchangedRanges({
      chunks,
      doc: state.doc,
      expandedLines: new Set([10]),
    })).toEqual([]);
  });
});
