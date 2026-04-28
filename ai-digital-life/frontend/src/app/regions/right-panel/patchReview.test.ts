import { describe, expect, it } from "vitest";
import type { PatchSet } from "@ai-digital-life/kernel";
import {
  countReviewedHunks,
  derivePatchFileChangeKind,
  derivePatchHunkChangeKind,
  filterPatchFileSummaries,
  getAdjacentPatchHunk,
  getPatchHunkTargetLine,
  setCollapsedHunksForFile,
  summarizePatchSet,
  toggleCollapsedHunkId
} from "./patchReview";

function createPatchSet(): PatchSet {
  return {
    id: "patchset-1",
    workspaceId: "workspace-1",
    sessionId: "session-1",
    title: "Patch",
    summary: "summary",
    status: "ready",
    createdAt: 1,
    updatedAt: 1,
    filePatches: [
      {
        id: "file-1",
        patchSetId: "patchset-1",
        relativePath: "src/a.ts",
        beforeContent: "old",
        afterContent: "new",
        hunks: [
          {
            id: "hunk-1",
            filePatchId: "file-1",
            patchSetId: "patchset-1",
            relativePath: "src/a.ts",
            oldStart: 0,
            oldLines: 0,
            newStart: 12,
            newLines: 3,
            preview: "add function",
            beforeText: "",
            afterText: "function next() {}",
            decision: "pending"
          },
          {
            id: "hunk-2",
            filePatchId: "file-1",
            patchSetId: "patchset-1",
            relativePath: "src/a.ts",
            oldStart: 20,
            oldLines: 4,
            newStart: 20,
            newLines: 4,
            preview: "update variable",
            beforeText: "const before = 1",
            afterText: "const after = 2",
            decision: "accepted"
          }
        ]
      },
      {
        id: "file-2",
        patchSetId: "patchset-1",
        relativePath: "src/b.ts",
        beforeContent: "old",
        afterContent: "new",
        hunks: [
          {
            id: "hunk-3",
            filePatchId: "file-2",
            patchSetId: "patchset-1",
            relativePath: "src/b.ts",
            oldStart: 8,
            oldLines: 2,
            newStart: 8,
            newLines: 0,
            preview: "remove block",
            beforeText: "obsolete()",
            afterText: "",
            decision: "rejected"
          }
        ]
      }
    ]
  };
}

describe("patchReview helpers", () => {
  it("derives hunk and file change kinds", () => {
    const patchSet = createPatchSet();
    expect(derivePatchHunkChangeKind(patchSet.filePatches[0].hunks[0])).toBe("added");
    expect(derivePatchHunkChangeKind(patchSet.filePatches[0].hunks[1])).toBe("modified");
    expect(derivePatchHunkChangeKind(patchSet.filePatches[1].hunks[0])).toBe("deleted");
    expect(derivePatchFileChangeKind(patchSet.filePatches[0])).toBe("modified");
    expect(derivePatchFileChangeKind(patchSet.filePatches[1])).toBe("deleted");
  });

  it("builds patch summaries and review counts", () => {
    const summaries = summarizePatchSet(createPatchSet(), ["hunk-1"]);
    expect(summaries).toHaveLength(2);
    expect(summaries[0].pendingHunks).toBe(1);
    expect(summaries[0].acceptedHunks).toBe(1);
    expect(summaries[0].hunks[0].isCollapsed).toBe(true);
    expect(countReviewedHunks(createPatchSet())).toEqual({
      total: 3,
      accepted: 1,
      rejected: 1,
      pending: 1
    });
  });

  it("filters by review state and finds adjacent hunks", () => {
    const patchSet = createPatchSet();
    const acceptedOnly = filterPatchFileSummaries(summarizePatchSet(patchSet), "accepted");
    expect(acceptedOnly).toHaveLength(1);
    expect(acceptedOnly[0].hunks).toHaveLength(1);
    expect(getAdjacentPatchHunk(patchSet, "hunk-1", "next")?.id).toBe("hunk-2");
    expect(getAdjacentPatchHunk(patchSet, "hunk-2", "previous")?.id).toBe("hunk-1");
    expect(getAdjacentPatchHunk(patchSet, undefined, "next")?.id).toBe("hunk-1");
  });

  it("computes reveal lines and collapsed hunk toggles", () => {
    const patchSet = createPatchSet();
    expect(getPatchHunkTargetLine(patchSet.filePatches[0].hunks[0])).toBe(9);
    expect(toggleCollapsedHunkId([], "hunk-1")).toEqual(["hunk-1"]);
    expect(toggleCollapsedHunkId(["hunk-1"], "hunk-1")).toEqual([]);
    expect(setCollapsedHunksForFile([], patchSet.filePatches[0], true)).toEqual(["hunk-1", "hunk-2"]);
    expect(setCollapsedHunksForFile(["hunk-1", "hunk-2"], patchSet.filePatches[0], false)).toEqual([]);
  });
});
