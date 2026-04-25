import type { RepoMapNode, WorkspaceTreeNode } from "@ai-digital-life/kernel";

function countFilesInTree(node: WorkspaceTreeNode): number {
  if (node.kind === "file") {
    return 1;
  }
  return node.children.reduce((sum, child) => sum + countFilesInTree(child), 0);
}

function mapNode(node: WorkspaceTreeNode): RepoMapNode {
  if (node.kind === "file") {
    return {
      path: node.path,
      name: node.name,
      kind: "file",
      fileCount: 0,
      children: []
    };
  }
  const children = node.children.map(mapNode);
  const fileCount = node.children.reduce((sum, child) => sum + countFilesInTree(child), 0);
  return {
    path: node.path,
    name: node.name,
    kind: "directory",
    fileCount,
    children
  };
}

/** Build repo-map tree (file counts per directory) from workspace file tree. */
export function workspaceTreeToRepoMap(nodes: WorkspaceTreeNode[]): RepoMapNode[] {
  return nodes.map(mapNode);
}
