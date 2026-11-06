import type { CommitNode } from '../types/gitGraph';
import { getRefLabelColor } from './branchLabelColors';

export interface RowDisplay {
  selected: boolean;
  color: string;
}

/**
 * Resolves the display state of a commit row during branch filtering.
 *
 * Anchor-priority selection coloring:
 * - No branch selected: every row is selected and shown in its owner color
 *   (or the lane fallback) — identical to the unfiltered graph.
 * - A selected branch is pinned to the node's own refs (the branch's head
 *   anchor): the row is selected and shown in THAT branch's color. This is
 *   what lights up the head node of a fully merged branch — its commits are
 *   owned by main, yet the label still points here, so it keeps its color.
 * - The owning branch is selected: selected in the owner color.
 * - Otherwise the row is dimmed but still keeps the owner/lane color.
 */
export function resolveRowDisplay(
  node: CommitNode,
  fallbackColor: string,
  ownership: Map<string, string>,
  selectedBranches: Set<string>,
  colorMap: ReadonlyMap<string, string>,
): RowDisplay {
  const owner = ownership.get(node.id);
  const ownerColor = owner ? getRefLabelColor(owner, colorMap) : fallbackColor;

  if (selectedBranches.size === 0) {
    return { selected: true, color: ownerColor };
  }

  const anchor = (node.refs ?? []).find((ref) => selectedBranches.has(ref));
  if (anchor) {
    return { selected: true, color: getRefLabelColor(anchor, colorMap) };
  }
  if (owner && selectedBranches.has(owner)) {
    return { selected: true, color: ownerColor };
  }
  return { selected: false, color: ownerColor };
}
