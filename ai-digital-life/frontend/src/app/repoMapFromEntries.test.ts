import { describe, expect, it } from "vitest";
import type { RepoMapEntry } from "@ai-digital-life/kernel";
import { repoMapEntriesToTree } from "./repoMapFromEntries";

describe("repoMapEntriesToTree", () => {
  it("rebuilds a nested tree from flattened retrieval entries", () => {
    const entries: RepoMapEntry[] = [
      { path: "frontend", type: "directory" },
      { path: "frontend/src", type: "directory" },
      { path: "frontend/src/App.tsx", type: "file" },
      { path: "frontend/src/store.ts", type: "file" },
      { path: "Cargo.toml", type: "file" }
    ];

    const tree = repoMapEntriesToTree(entries);

    expect(tree.map((node) => node.path)).toEqual(["frontend", "Cargo.toml"]);
    expect(tree[0].kind).toBe("directory");
    expect(tree[0].fileCount).toBe(2);
    expect(tree[0].children[0]?.path).toBe("frontend/src");
    expect(tree[0].children[0]?.children.map((node) => node.path)).toEqual([
      "frontend/src/App.tsx",
      "frontend/src/store.ts"
    ]);
  });
});
