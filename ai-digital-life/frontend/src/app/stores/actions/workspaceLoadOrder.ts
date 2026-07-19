import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';

export interface LoadPhases {
  /** High priority: loaded synchronously at app startup (blocks first screen). */
  priority: RecentWorkspaceEntry[];
  /** Medium priority: loaded asynchronously after first screen is ready. */
  deferred: RecentWorkspaceEntry[];
  /** Low priority: loaded after priority and deferred phases complete. */
  natural: RecentWorkspaceEntry[];
}

/**
 * Compute the cascading workspace load order from three independent ID arrays.
 *
 * Rules:
 * - IDs in `priorityIds` / `deferredIds` / `naturalOrder` are resolved against
 *   `visibleWorkspaces` and placed in their respective phase, preserving array order.
 * - IDs that don't match any visible workspace (orphans) are silently filtered out.
 * - Visible workspaces that don't appear in any of the three arrays (strays) are
 *   appended to the end of the `natural` phase, in `visibleWorkspaces` order.
 *
 * This function is pure — no side effects, no I/O. Trivially unit-testable.
 */
export function computeLoadPhases(
  priorityIds: string[],
  deferredIds: string[],
  naturalOrder: string[],
  visibleWorkspaces: RecentWorkspaceEntry[]
): LoadPhases {
  const lookup = new Map(visibleWorkspaces.map((w) => [w.id, w] as const));
  const configured = new Set<string>([...priorityIds, ...deferredIds, ...naturalOrder]);

  const resolve = (ids: string[]): RecentWorkspaceEntry[] =>
    ids.map((id) => lookup.get(id)).filter((w): w is RecentWorkspaceEntry => w !== undefined);

  return {
    priority: resolve(priorityIds),
    deferred: resolve(deferredIds),
    natural: [...resolve(naturalOrder), ...visibleWorkspaces.filter((w) => !configured.has(w.id))],
  };
}
