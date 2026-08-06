import type { CommitNode, CommitEdge } from '../types/gitGraph';

/**
 * Computes which local branch "owns" each commit in the branch graph.
 *
 * Ownership model (hybrid rule):
 * - The mainline branch (`main`, else `master`, else the first local branch)
 *   owns its first-parent spine — every commit on the direct first-parent
 *   chain from the mainline tip. This keeps shared history and the mainline
 *   spine on the mainline even when a short side branch forks nearby.
 * - Every other commit is owned by the local branch whose tip is nearest
 *   (fewest parent-edges away, BFS). Commits merged into main keep their
 *   original branch: they are not on the spine, so the nearest feature tip
 *   (which still reaches them) wins.
 * - Spine barrier: a non-mainline branch's BFS may not cross the mainline
 *   first-parent spine (`if (spine.has(p)) continue`). This prevents a branch
 *   that merely fast-forwards off main from walking the entire spine and
 *   claiming orphaned commits behind it. Every branch still reaches all of its
 *   own non-spine commits without crossing the spine.
 * - A non-spine commit reachable only from the mainline tip (e.g. the merged
 *   second parent of an already-deleted branch) falls back to the mainline.
 * - Commits not reachable from any local branch tip (e.g. reachable only from
 *   remote refs) have no owner (`undefined`).
 *
 * Merge edges MUST be git-faithful: a merge commit's first parent must be the
 * current branch's previous tip (as `git log --pretty=%P` orders parents).
 * The Rust side and the frontend adapters preserve that order.
 */
export function computeBranchOwnership(
  nodes: CommitNode[],
  edges: CommitEdge[],
  branches: string[],
): Map<string, string> {
  if (nodes.length === 0) {
    return new Map();
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

  const localBranches = branches.filter(
    (b) => !b.startsWith('origin/') && !b.startsWith('upstream/') && b !== 'HEAD',
  );
  if (localBranches.length === 0) {
    return new Map();
  }

  const mainline =
    localBranches.find((b) => b === 'main') ??
    localBranches.find((b) => b === 'master') ??
    localBranches[0];
  const nonMainline = localBranches.filter((b) => b !== mainline);

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
  const spine = new Set<string>();
  for (const tip of mainlineTips) {
    let current: string | undefined = tip;
    while (current !== undefined && !spine.has(current)) {
      spine.add(current);
      const parents = parentMap.get(current);
      current = parents && parents.length > 0 ? parents[0] : undefined;
    }
  }

  const reachable = new Map<string, Set<string>>();
  const distance = new Map<string, Map<string, number>>();
  for (const branch of nonMainline) {
    const tips = tipsByBranch.get(branch) ?? [];
    if (tips.length === 0) {
      continue;
    }
    const dist = new Map<string, number>();
    const queue: string[] = [];
    for (const tip of tips) {
      dist.set(tip, 0);
      queue.push(tip);
    }
    for (const id of queue) {
      const d = dist.get(id) ?? 0;
      for (const p of parentMap.get(id) ?? []) {
        if (spine.has(p)) {
          continue;
        }
        if (!dist.has(p)) {
          dist.set(p, d + 1);
          queue.push(p);
        }
      }
    }
    distance.set(branch, dist);
    reachable.set(branch, new Set(dist.keys()));
  }

  const mainReachable = new Set<string>();
  if (mainlineTips.length > 0) {
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
  }

  const result = new Map<string, string>();
  for (const node of nodes) {
    if (spine.has(node.id)) {
      result.set(node.id, mainline);
      continue;
    }
    let winner: string | null = null;
    let bestDistance = Infinity;
    for (const [branch, dist] of distance) {
      const d = dist.get(node.id);
      if (d === undefined) {
        continue;
      }
      if (d < bestDistance || (d === bestDistance && tieBreak(branch, winner))) {
        bestDistance = d;
        winner = branch;
      }
    }
    if (winner !== null) {
      result.set(node.id, winner);
    } else if (mainReachable.has(node.id)) {
      result.set(node.id, mainline);
    }
  }
  return result;
}

/** Deterministic tie-break for equally near branch tips. */
function tieBreak(a: string, b: string | null): boolean {
  if (b === null) {
    return true;
  }
  const rank = (name: string) => (name === 'main' ? 0 : name === 'master' ? 1 : 2);
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) {
    return ra < rb;
  }
  return a < b;
}
