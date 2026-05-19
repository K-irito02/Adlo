import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("outline panel wiring", () => {
  const fileNavigatorShellSource = readFileSync(new URL("./FileNavigatorShell.tsx", import.meta.url), "utf8");
  const editorSurfaceShellSource = readFileSync(new URL("./EditorSurfaceShell.tsx", import.meta.url), "utf8");
  const changesPanelSource = readFileSync(new URL("./ChangesPanel.tsx", import.meta.url), "utf8");
  const previewWorkspaceServiceSource = readFileSync(new URL("../../../../dev/previewWorkspaceService.ts", import.meta.url), "utf8");
  const outlineTreeSource = readFileSync(new URL("./OutlineTree.tsx", import.meta.url), "utf8");
  const fileTreeSource = readFileSync(new URL("./fileTree.tsx", import.meta.url), "utf8");
  const treeNodeRowSource = readFileSync(new URL("./TreeNodeRow.tsx", import.meta.url), "utf8");

  it("uses the shared outline tree in the files panel", () => {
    expect(fileNavigatorShellSource).toContain("OutlineTree");
    expect(editorSurfaceShellSource).toContain("handleRevealPreviewLine");
    expect(editorSurfaceShellSource).toContain("data-source-line");
    expect(fileNavigatorShellSource).toContain('setNavigatorMode("tree")');
    expect(fileNavigatorShellSource).toContain("handleToggleAllOutlineItems");
    expect(fileNavigatorShellSource).toContain("expandedIds={expandedOutlineIds}");
  });

  it("uses the shared outline tree and outline mode in the changes panel", () => {
    expect(changesPanelSource).toContain("OutlineTree");
    expect(changesPanelSource).toContain('setChangesNavigatorMode("outline")');
    expect(changesPanelSource).toContain("buildOutlineFromContent(changePreview.currentContent");
    expect(changesPanelSource).toContain("handleRevealOutlineLine");
    expect(changesPanelSource).toContain("setForceExpandUnchangedDiff(true)");
    expect(changesPanelSource).toContain("handleToggleAllOutlineItems");
    expect(changesPanelSource).toContain('changesNavigatorMode === "tree" || changesNavigatorMode === "outline"');
  });

  it("uses the shared outline parser in preview workspace mode", () => {
    expect(previewWorkspaceServiceSource).toContain('from "../src/shared/outline"');
    expect(previewWorkspaceServiceSource).toContain("return buildOutlineFromContent(document.content");
  });

  it("wraps both trees in a dedicated scroll container", () => {
    expect(outlineTreeSource).toContain("CustomScrollArea");
    expect(fileTreeSource).toContain("CustomScrollArea");
    expect(outlineTreeSource).toContain('shellClassName="adl-outline-tree-shell"');
    expect(fileTreeSource).toContain('shellClassName="adl-filetree-shell"');
  });

  it("uses the shared tree row chrome for outline and file trees", () => {
    expect(outlineTreeSource).toContain("TreeNodeRow");
    expect(fileTreeSource).toContain("TreeNodeRow");
    expect(treeNodeRowSource).toContain("adl-tree-node__row");
    expect(treeNodeRowSource).toContain("adl-tree-node__toggle");
  });

  it("tracks active file tree path independently so directory clicks also show the selected chrome", () => {
    expect(fileTreeSource).toContain("const [activePath, setActivePath] = useState<string | undefined>(props.selectedFilePath)");
    expect(fileTreeSource).toContain("setActivePath(path);");
    expect(fileTreeSource).toContain("isActive={isSelected}");
  });
});
