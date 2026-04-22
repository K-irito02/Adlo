import { describe, expect, it } from "vitest";
import { buildWorkspaceTree } from "@ai-digital-life/fs-ops";

describe("buildWorkspaceTree", () => {
  it("builds nested nodes with directories sorted before files", () => {
    const tree = buildWorkspaceTree([
      "src/zeta.ts",
      "README.md",
      "src/components/Button.tsx",
      "src/components/index.ts",
      "docs/guide.md"
    ]);

    expect(tree.map((node) => `${node.kind}:${node.name}`)).toEqual([
      "directory:docs",
      "directory:src",
      "file:README.md"
    ]);
    expect(tree[1]?.children.map((node) => `${node.kind}:${node.name}`)).toEqual([
      "directory:components",
      "file:zeta.ts"
    ]);
  });

  it("preserves stable workspace-relative paths for deep trees", () => {
    const tree = buildWorkspaceTree(["a/b/c/file.ts"]);
    expect(tree[0]?.path).toBe("a");
    expect(tree[0]?.children[0]?.path).toBe("a/b");
    expect(tree[0]?.children[0]?.children[0]?.path).toBe("a/b/c");
    expect(tree[0]?.children[0]?.children[0]?.children[0]?.path).toBe("a/b/c/file.ts");
  });

  it("returns an empty tree for empty input", () => {
    expect(buildWorkspaceTree([])).toEqual([]);
  });

  it("ignores blank path fragments and normalizes separators", () => {
    const tree = buildWorkspaceTree(["foo\\bar.ts", " ", "", "foo/baz.ts"]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.children.map((node) => node.path)).toEqual(["foo/bar.ts", "foo/baz.ts"]);
  });
});
