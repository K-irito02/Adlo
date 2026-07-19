import { useAppStore } from '../slicedStore';
import type { AppPreferencePatch } from '../../../shared/ipc-types.generated';

/**
 * Detects workspaces that exist in `recentWorkspaces` (visible) but are not in
 * any of the three loading lists (priority / deferred / natural), and inserts
 * them at the HEAD of `workspaceNaturalOrder` (newest-added first).
 *
 * Also prunes IDs from the three lists that no longer correspond to any visible
 * workspace (orphan cleanup — e.g., workspace was removed from sidebar).
 *
 * This is a one-shot sync function — call it whenever `recentWorkspaces` updates.
 * Debouncing / effect-wiring is the caller's responsibility.
 */
export function syncNewWorkspacesToNaturalOrder(): void {
  const state = useAppStore.getState();
  const appInfo = state.appInfo;
  const recentWorkspaces = state.recentWorkspaces;
  if (!appInfo) {
    return;
  }

  const config = appInfo.config;
  const priorityIds = config.workspacePriorityIds ?? [];
  const deferredIds = config.workspaceDeferredIds ?? [];
  const naturalOrder = config.workspaceNaturalOrder ?? [];

  const visibleWorkspaces = recentWorkspaces.filter(
    (w) => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available
  );
  const visibleIds = new Set(visibleWorkspaces.map((w) => w.id));
  const configured = new Set<string>([...priorityIds, ...deferredIds, ...naturalOrder]);

  // Strays: visible but not in any list → insert at head
  const strays = visibleWorkspaces.filter((w) => !configured.has(w.id)).map((w) => w.id);

  // Prune orphans: IDs in lists that no longer correspond to visible workspaces
  const prune = (ids: string[]) => ids.filter((id) => visibleIds.has(id));
  const nextPriority = prune(priorityIds);
  const nextDeferred = prune(deferredIds);
  const nextNatural = prune(naturalOrder);

  // Only persist if something actually changed
  const changed =
    strays.length > 0 ||
    nextPriority.length !== priorityIds.length ||
    nextDeferred.length !== deferredIds.length ||
    nextNatural.length !== naturalOrder.length;

  if (!changed) {
    return;
  }

  const patch: AppPreferencePatch = {
    workspacePriorityIds: nextPriority,
    workspaceDeferredIds: nextDeferred,
    workspaceNaturalOrder: [...strays, ...nextNatural],
  };

  void state.updatePreferences(patch);
}
