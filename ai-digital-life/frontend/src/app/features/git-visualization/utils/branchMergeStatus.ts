import type { CommitNode, CommitEdge } from '../types/gitGraph';

/**
 * Returns the set of local branches that are fully merged into the mainline.
 *
 * A branch B is "merged into main" when every tip of B is reachable from the
 * mainline tip by walking parent edges — the graph equivalent of
 * `git merge-base --is-ancestor B main`. This covers both merge-commit
 * absorption (B was merged via a merge commit) and fast-forward absorption
 * (B was re-based/ff-merged so its tip now sits on the mainline spine).
 * The mainline itself is never reported as merged.
 */
export function computeMergedBranches(
  nodes: CommitNode[],
  edges: CommitEdge[],
  branches: string[],
): Set<string> {
  const result = new Set<string>();
  const localBranches = branches.filter(
    (b) => !b.startsWith('origin/') && !b.startsWith('upstream/') && b !== 'HEAD',
  );
  if (localBranches.length === 0) {
    return result;
  }

  const mainline =
    localBranches.find((b) => b === 'main') ??
    localBranches.find((b) => b === 'master') ??
    localBranches[0];
  const nonMainline = localBranches.filter((b) => b !== mainline);
  if (nonMainline.length === 0) {
    return result;
  }

  const parentMap = new Map<string, string[]>();
  for (const edge of edges) {
    const list = parentMap.get(edge.source);
    if (list) {
      list.push(edge.target);
    } else {
      parentMap.set(edge.source, [edge.target]);
    }
  }

  const tipsByBranch = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.refs) {
      continue;
    }
    for (const ref of node.refs) {
      if (!localBranches.includes(ref)) {
        continue;
      }
      const list = tipsByBranch.get(ref);
      if (list) {
        if (!list.includes(node.id)) {
          list.push(node.id);
        }
      } else {
        tipsByBranch.set(ref, [node.id]);
      }
    }
  }

  const mainlineTips = tipsByBranch.get(mainline) ?? [];
  if (mainlineTips.length === 0) {
    return result;
  }

  const mainReachable = new Set<string>();
  const stack = [...mainlineTips];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (mainReachable.has(id)) {
      continue;
    }
    mainReachable.add(id);
    for (const p of parentMap.get(id) ?? []) {
      stack.push(p);
    }
  }

  for (const branch of nonMainline) {
    const tips = tipsByBranch.get(branch) ?? [];
    if (tips.length === 0) {
      continue;
    }
    if (tips.every((tip) => mainReachable.has(tip))) {
      result.add(branch);
    }
  }
  return result;
}
