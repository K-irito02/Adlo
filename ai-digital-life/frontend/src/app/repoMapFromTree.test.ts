import { describe, expect, it } from "vitest";
import type { WorkspaceTreeNode } from "@ai-digital-life/kernel";
import { workspaceTreeToRepoMap } from "./repoMapFromTree";

describe("workspaceTreeToRepoMap", () => {
  it("counts files under directories", () => {
    const tree: WorkspaceTreeNode[] = [
      {
        path: "src",
        name: "src",
        kind: "directory",
        children: [
          { path: "src/a.ts", name: "a.ts", kind: "file", children: [] },
          { path: "src/b.ts", name: "b.ts", kind: "file", children: [] }
        ]
      }
    ];
    const map = workspaceTreeToRepoMap(tree);
    expect(map).toHaveLength(1);
    expect(map[0].kind).toBe("directory");
    expect(map[0].fileCount).toBe(2);
    expect(map[0].children).toHaveLength(2);
  });
});
