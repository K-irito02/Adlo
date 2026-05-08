import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FileTree, type FileTreeRenderableNode } from "./fileTree";

describe("FileTree", () => {
  it("renders the shared tree row chrome inside the dedicated scroll wrapper", () => {
    const nodes: FileTreeRenderableNode[] = [
      {
        path: "src",
        name: "src",
        kind: "directory",
        children: [
          {
            path: "src/file.ts",
            name: "file.ts",
            kind: "file",
            children: [],
          },
        ],
      },
    ];

    const markup = renderToStaticMarkup(
      <FileTree
        nodes={nodes}
        selectedFilePath="src/file.ts"
        expandedPaths={{ src: true }}
        onToggle={() => undefined}
        onOpenFile={() => undefined}
        expandLabel="Expand"
        collapseLabel="Collapse"
      />
    );

    expect(markup).toContain("adl-filetree-scroll");
    expect(markup).toContain("adl-filetree-scrollbar");
    expect(markup).toContain("adl-tree-root");
    expect(markup).toContain("adl-tree-node__toggle");
    expect(markup).toContain("adl-filetree__row");
    expect(markup).toContain("adl-tree-node is-active");
  });
});
