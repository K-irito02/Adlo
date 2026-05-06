import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FileTree, type FileTreeRenderableNode } from "./fileTree";

describe("FileTree", () => {
  it("renders the dedicated scroll wrapper so row backgrounds can extend to the edge", () => {
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
      />
    );

    expect(markup).toContain("adl-filetree-scroll");
    expect(markup).toContain("adl-filetree-scrollbar");
    expect(markup).toContain("adl-filetree__node is-active");
  });
});
