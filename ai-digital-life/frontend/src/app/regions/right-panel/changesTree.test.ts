import { describe, expect, it } from "vitest";
import type { GitSnapshot, PatchSet } from "@ai-digital-life/kernel";
import { summarizePatchSet } from "./patchReview";
import { buildChangeEntries, buildChangeTree, buildFlatChangeNodes } from "./changesTree";

function createSnapshot(): GitSnapshot {
  return {
    isRepo: true,
    branch: "main",
    staged: ["src/a.ts"],
    unstaged: ["src/a.ts", "src/nested/b.ts"],
    untracked: ["docs/new.md"],
    conflicts: ["src/conflict.ts"],
    capturedAt: 1
  };
}

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
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 2,
            preview: "update",
            beforeText: "old",
            afterText: "new",
            decision: "accepted"
          }
        ]
      },
      {
        id: "file-2",
        patchSetId: "patchset-1",
        relativePath: "src/removed.ts",
        beforeContent: "old",
        afterContent: "",
        hunks: [
          {
            id: "hunk-2",
            filePatchId: "file-2",
            patchSetId: "patchset-1",
            relativePath: "src/removed.ts",
            oldStart: 4,
            oldLines: 2,
            newStart: 0,
            newLines: 0,
            preview: "remove",
            beforeText: "gone",
            afterText: "",
            decision: "pending"
          }
        ]
      }
    ]
  };
}

describe("changesTree helpers", () => {
  it("deduplicates paths while preserving combined change states", () => {
    const entries = buildChangeEntries(createSnapshot(), summarizePatchSet(createPatchSet()));
    const sourceFile = entries.find((entry) => entry.path === "src/a.ts");
    expect(sourceFile?.states).toEqual(["modified", "staged"]);
    expect(entries.map((entry) => entry.path)).toContain("src/removed.ts");
  });

  it("builds a hierarchical tree with directory counts and deleted file fallbacks", () => {
    const entries = buildChangeEntries(createSnapshot(), summarizePatchSet(createPatchSet()));
    const tree = buildChangeTree(entries);
    expect(tree[0].path).toBe("docs");
    const srcNode = tree.find((node) => node.path === "src");
    expect(srcNode?.fileCount).toBe(4);
    const removedNode = srcNode?.children.find((node) => node.path === "src/removed.ts");
    expect(removedNode?.missing).toBe(true);
    expect(removedNode?.changeKind).toBe("deleted");
  });

  it("builds a flat list view from the same change entries", () => {
    const entries = buildChangeEntries(createSnapshot(), summarizePatchSet(createPatchSet()));
    const flatNodes = buildFlatChangeNodes(entries);
    expect(flatNodes.every((node) => node.kind === "file")).toBe(true);
    expect(flatNodes).toHaveLength(entries.length);
    expect(flatNodes[0].children).toEqual([]);
  });

  it("shows basename labels in flat list mode", () => {
    const flatNodes = buildFlatChangeNodes([
      {
        path: "packages/frontend/src/app/store.ts",
        states: ["modified"],
      },
    ]);

    expect(flatNodes[0].path).toBe("packages/frontend/src/app/store.ts");
    expect(flatNodes[0].name).toBe("store.ts");
  });
});
