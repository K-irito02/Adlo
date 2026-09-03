import { useCallback, useMemo } from 'react';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';

export interface WorkspacePinResult {
  handleTogglePin: (workspaceId: string) => void;
  isPinned: (workspaceId: string) => boolean;
  pinnedCount: number;
}

export function useWorkspacePin(
  workspaceItems: RecentWorkspaceEntry[],
  onPinWorkspace: (id: string) => void,
  onUnpinWorkspace: (id: string) => void,
): WorkspacePinResult {
  const pinnedIds = useMemo(
    () => new Set(workspaceItems.filter((w) => w.isPinned).map((w) => w.id)),
    [workspaceItems],
  );

  const handleTogglePin = useCallback(
    (workspaceId: string) => {
      if (pinnedIds.has(workspaceId)) {
        onUnpinWorkspace(workspaceId);
      } else {
        onPinWorkspace(workspaceId);
      }
    },
    [pinnedIds, onPinWorkspace, onUnpinWorkspace],
  );

  const isPinned = useCallback((workspaceId: string) => pinnedIds.has(workspaceId), [pinnedIds]);

  return { handleTogglePin, isPinned, pinnedCount: pinnedIds.size };
}
