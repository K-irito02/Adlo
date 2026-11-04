import type { FileOutlineItem } from '@shared/ipc';
import { buildOutlineFromContent, outlineForChangePreview } from '@shared/outline';

export type OutlineNode = FileOutlineItem & {
  children: OutlineNode[];
};

export interface VisibleOutlineNode {
  item: OutlineNode;
  depth: number;
  hasChildren: boolean;
}

export { buildOutlineFromContent, outlineForChangePreview };

export function buildOutlineTree(items: FileOutlineItem[]): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: OutlineNode[] = [];

  for (const item of items) {
    const depth = Math.max(1, item.depth ?? 1);
    const node: OutlineNode = {
      ...item,
      depth,
      children: [],
    };

    while (stack.length > 0 && Math.max(1, stack[stack.length - 1]!.depth ?? 1) >= depth) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
    stack.push(node);
  }

  return roots;
}

export function getDefaultExpandedOutlineIds(items: FileOutlineItem[]): Set<string> {
  const expanded = new Set<string>();

  function visit(nodes: OutlineNode[]) {
    for (const node of nodes) {
      if (node.children.length > 0) {
        expanded.add(node.id);
        visit(node.children);
      }
    }
  }

  visit(buildOutlineTree(items));
  return expanded;
}

export function flattenVisibleOutlineNodes(
  nodes: OutlineNode[],
  expandedIds: ReadonlySet<string>,
  depth = 1,
): VisibleOutlineNode[] {
  const visible: VisibleOutlineNode[] = [];

  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    visible.push({ item: node, depth, hasChildren });
    if (hasChildren && expandedIds.has(node.id)) {
      visible.push(...flattenVisibleOutlineNodes(node.children, expandedIds, depth + 1));
    }
  }

  return visible;
}
