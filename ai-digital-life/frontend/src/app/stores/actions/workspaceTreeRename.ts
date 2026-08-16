import type { WorkspaceTreeNode } from '@ai-digital-life/kernel';

/**
 * Returns a new tree with the node at `oldPath` (and, for directories, all of its
 * descendants) remapped to `newPath`. Used for the optimistic rename so the tree
 * updates instantly instead of waiting for a full `listTree` round-trip.
 */
export function renameTreeNodePaths(
  nodes: WorkspaceTreeNode[],
  oldPath: string,
  newPath: string,
): WorkspaceTreeNode[] {
  const oldSegments = oldPath.split('/').filter(Boolean);
  const newSegments = newPath.split('/').filter(Boolean);
  const mapNode = (node: WorkspaceTreeNode): WorkspaceTreeNode => {
    const segments = node.path.split('/').filter(Boolean);
    if (
      segments.length >= oldSegments.length &&
      oldSegments.every((segment, index) => segments[index] === segment)
    ) {
      // 节点自身位于被重命名路径上：重建其 path/name/children。
      const rest = segments.slice(oldSegments.length);
      const nextPath = [...newSegments, ...rest].join('/');
      return {
        ...node,
        path: nextPath,
        name: rest.length === 0 ? newSegments[newSegments.length - 1] : node.name,
        children: node.children.map(mapNode),
      };
    }
    // 节点不在重命名路径上；仅当其某个后代在路径上（即它是 oldPath 的祖先）时才重建，
    // 且后代未变化时保留原引用，避免无谓重建整棵树（破坏 React.memo 引用相等）。
    const isAncestor =
      segments.length < oldSegments.length &&
      oldSegments.every((segment, index) => segments[index] === segment) &&
      node.children.length > 0;
    if (!isAncestor) {
      return node;
    }
    const nextChildren = node.children.map(mapNode);
    let changed = false;
    for (let i = 0; i < nextChildren.length; i++) {
      if (nextChildren[i] !== node.children[i]) {
        changed = true;
        break;
      }
    }
    return changed ? { ...node, children: nextChildren } : node;
  };
  return nodes.map(mapNode);
}

/**
 * Remaps expanded-path state keys that point at (or descend from) `oldPath`
 * so they follow a renamed directory. Returns the same reference when nothing
 * changed.
 */
export function remapExpandedTreePaths(
  expanded: Record<string, boolean>,
  oldPath: string,
  newPath: string,
): Record<string, boolean> {
  const prefix = `${oldPath}/`;
  let changed = false;
  const next: Record<string, boolean> = {};
  for (const [path, value] of Object.entries(expanded)) {
    let mapped = path;
    if (path === oldPath) {
      mapped = newPath;
    } else if (path.startsWith(prefix)) {
      mapped = `${newPath}${path.slice(oldPath.length)}`;
    }
    if (mapped !== path) {
      changed = true;
    }
    next[mapped] = value;
  }
  return changed ? next : expanded;
}

/**
 * Sorts sibling nodes the same way the Rust backend does: directories first,
 * then by name (case-insensitive). Used to keep optimistic insertions in the
 * same order a full `listTree` scan would produce.
 */
function compareTreeNodes(a: WorkspaceTreeNode, b: WorkspaceTreeNode): number {
  if (a.kind !== b.kind) {
    return a.kind === 'directory' ? -1 : 1;
  }
  return a.name.localeCompare(b.name);
}

/**
 * Returns a new tree with `newNode` inserted as a child of the directory at
 * `parentPath` (empty string inserts at the tree root), keeping siblings sorted.
 * Used for the optimistic create so the new file/folder appears instantly
 * instead of waiting for a full `listTree` round-trip.
 */
export function insertTreeNode(
  nodes: WorkspaceTreeNode[],
  parentPath: string,
  newNode: WorkspaceTreeNode,
): WorkspaceTreeNode[] {
  if (!parentPath) {
    return [...nodes, newNode].sort(compareTreeNodes);
  }
  const parentSegments = parentPath.split('/').filter(Boolean);
  const parentLen = parentSegments.length;
  const walk = (list: WorkspaceTreeNode[]): WorkspaceTreeNode[] =>
    list.map((node) => {
      const segments = node.path.split('/').filter(Boolean);
      const isParent =
        segments.length === parentLen && parentSegments.every((s, i) => segments[i] === s);
      if (isParent) {
        const nextChildren = [...(node.children ?? []), newNode].sort(compareTreeNodes);
        return { ...node, children: nextChildren };
      }
      const isAncestor =
        segments.length < parentLen &&
        segments.every((s, i) => parentSegments[i] === s) &&
        node.children?.length;
      if (isAncestor) {
        return { ...node, children: walk(node.children as WorkspaceTreeNode[]) };
      }
      return node;
    });
  return walk(nodes);
}

/**
 * Returns a new tree with the node at `targetPath` (and, for directories, all of
 * its descendants) removed. Used for the optimistic delete so the node disappears
 * instantly instead of waiting for a full `listTree` round-trip.
 */
export function removeTreeNode(
  nodes: WorkspaceTreeNode[],
  targetPath: string,
): WorkspaceTreeNode[] {
  const targetSegments = targetPath.split('/').filter(Boolean);
  const targetLen = targetSegments.length;
  const walk = (list: WorkspaceTreeNode[]): WorkspaceTreeNode[] => {
    const out: WorkspaceTreeNode[] = [];
    for (const node of list) {
      const segments = node.path.split('/').filter(Boolean);
      const isSelf =
        segments.length === targetLen && targetSegments.every((s, i) => segments[i] === s);
      if (isSelf) {
        continue;
      }
      const isAncestor =
        segments.length < targetLen &&
        segments.every((s, i) => targetSegments[i] === s) &&
        node.children?.length;
      if (isAncestor) {
        out.push({ ...node, children: walk(node.children as WorkspaceTreeNode[]) });
      } else {
        out.push(node);
      }
    }
    return out;
  };
  return walk(nodes);
}
