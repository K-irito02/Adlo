import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ReorderSessionsInput } from '@ai-digital-life/kernel';
import type { SidebarSessionItem } from '../../utils/sidebarViewModel';
import { moveIdAfterTarget, moveIdToBucketEnd, moveIdWithinBucket } from '../../utils/dragUtils';

const DROP_FLASH_DURATION_MS = 900;

function computeReorder(
  sessionItems: SidebarSessionItem[],
  isPinnedBucket: boolean,
  nextIds: string[]
): { pinnedIds: string[]; unpinnedIds: string[] } {
  if (isPinnedBucket) {
    return {
      pinnedIds: nextIds,
      unpinnedIds: sessionItems
        .filter((item) => !item.session.isPinned)
        .map((item) => item.session.id),
    };
  }
  return {
    pinnedIds: sessionItems.filter((item) => item.session.isPinned).map((item) => item.session.id),
    unpinnedIds: nextIds,
  };
}

export function useSessionDragDrop({
  sessionItems,
  workspaceId,
  onReorderSessions,
}: {
  sessionItems: SidebarSessionItem[];
  workspaceId?: string;
  onReorderSessions: (input: ReorderSessionsInput) => void;
}): {
  dragSessionId: string | undefined;
  setDragSessionId: Dispatch<SetStateAction<string | undefined>>;
  dragOverSessionId: string | undefined;
  setDragOverSessionTarget: (nextSessionId: string | undefined) => void;
  droppedSessionId: string | undefined;
  handleSessionDrop: (targetSessionId: string, isPinnedBucket: boolean) => void;
  handleSessionDropAfterVisibleTarget: (targetSessionId: string, isPinnedBucket: boolean) => void;
  handleSessionDropToBucketEnd: (isPinnedBucket: boolean) => void;
} {
  const [dragSessionId, setDragSessionId] = useState<string>();
  const [dragOverSessionId, setDragOverSessionId] = useState<string>();
  const [droppedSessionId, setDroppedSessionId] = useState<string>();
  const [dropFlashTimer, setDropFlashTimer] = useState<number | null>(null);

  useEffect(() => {
    return () => {
      if (dropFlashTimer !== null) {
        window.clearTimeout(dropFlashTimer);
      }
    };
  }, [dropFlashTimer]);

  const setDragOverSessionTarget = useCallback((nextSessionId: string | undefined) => {
    setDragOverSessionId(nextSessionId);
  }, []);

  const flashDroppedSession = useCallback(
    (sessionId: string) => {
      if (dropFlashTimer !== null) {
        window.clearTimeout(dropFlashTimer);
      }
      setDroppedSessionId(sessionId);
      const id = window.setTimeout(() => {
        setDroppedSessionId((current) => (current === sessionId ? undefined : current));
        setDropFlashTimer(null);
      }, DROP_FLASH_DURATION_MS);
      setDropFlashTimer(id);
    },
    [dropFlashTimer]
  );

  const handleSessionDrop = useCallback(
    (targetSessionId: string, isPinnedBucket: boolean) => {
      if (!dragSessionId || dragSessionId === targetSessionId || !workspaceId) {
        return;
      }
      const bucketItems = sessionItems
        .filter((item) => item.session.isPinned === isPinnedBucket)
        .map((item) => item.session.id);
      if (!bucketItems.includes(dragSessionId)) {
        return;
      }
      const nextIds = moveIdWithinBucket(bucketItems, dragSessionId, targetSessionId);
      const { pinnedIds, unpinnedIds } = computeReorder(sessionItems, isPinnedBucket, nextIds);
      onReorderSessions({ workspaceId, pinnedIds, unpinnedIds });
      flashDroppedSession(dragSessionId);
      setDragSessionId(undefined);
      setDragOverSessionTarget(undefined);
    },
    [
      dragSessionId,
      flashDroppedSession,
      onReorderSessions,
      sessionItems,
      setDragOverSessionTarget,
      workspaceId,
    ]
  );

  const handleSessionDropAfterVisibleTarget = useCallback(
    (targetSessionId: string, isPinnedBucket: boolean) => {
      if (!dragSessionId || dragSessionId === targetSessionId || !workspaceId) {
        return;
      }
      const bucketItems = sessionItems
        .filter((item) => item.session.isPinned === isPinnedBucket)
        .map((item) => item.session.id);
      if (!bucketItems.includes(dragSessionId)) {
        return;
      }
      const nextIds = moveIdAfterTarget(bucketItems, dragSessionId, targetSessionId);
      const { pinnedIds, unpinnedIds } = computeReorder(sessionItems, isPinnedBucket, nextIds);
      onReorderSessions({ workspaceId, pinnedIds, unpinnedIds });
      flashDroppedSession(dragSessionId);
      setDragSessionId(undefined);
      setDragOverSessionTarget(undefined);
    },
    [
      dragSessionId,
      flashDroppedSession,
      onReorderSessions,
      sessionItems,
      setDragOverSessionTarget,
      workspaceId,
    ]
  );

  const handleSessionDropToBucketEnd = useCallback(
    (isPinnedBucket: boolean) => {
      if (!dragSessionId || !workspaceId) {
        return;
      }
      const bucketItems = sessionItems
        .filter((item) => item.session.isPinned === isPinnedBucket)
        .map((item) => item.session.id);
      if (!bucketItems.includes(dragSessionId)) {
        return;
      }
      const nextIds = moveIdToBucketEnd(bucketItems, dragSessionId);
      const { pinnedIds, unpinnedIds } = computeReorder(sessionItems, isPinnedBucket, nextIds);
      onReorderSessions({ workspaceId, pinnedIds, unpinnedIds });
      flashDroppedSession(dragSessionId);
      setDragSessionId(undefined);
      setDragOverSessionTarget(undefined);
    },
    [
      dragSessionId,
      flashDroppedSession,
      onReorderSessions,
      sessionItems,
      setDragOverSessionTarget,
      workspaceId,
    ]
  );

  return {
    dragSessionId,
    setDragSessionId,
    dragOverSessionId,
    setDragOverSessionTarget,
    droppedSessionId,
    handleSessionDrop,
    handleSessionDropAfterVisibleTarget,
    handleSessionDropToBucketEnd,
  };
}
