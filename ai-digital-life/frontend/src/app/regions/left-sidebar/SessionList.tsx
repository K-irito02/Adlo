import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReorderSessionsInput } from '@ai-digital-life/kernel';
import type { CopyDict, Locale } from '../../i18n';
import { RenameDialog } from '../../components/RenameDialog';
import { getVisibleSidebarSessions, type SidebarSessionItem } from '../../utils/sidebarViewModel';
import SessionListRow from './SessionListRow';

import { moveIdWithinBucket, moveIdToBucketEnd, moveIdAfterTarget } from '../../utils/dragUtils';

const DROP_FLASH_DURATION_MS = 900;

function mergeEphemeralVisibleSessions(
  allItems: SidebarSessionItem[],
  visibleItems: SidebarSessionItem[],
  ephemeralIds: string[]
): SidebarSessionItem[] {
  if (ephemeralIds.length === 0) {
    return visibleItems;
  }
  const visibleIds = new Set(visibleItems.map((item) => item.session.id));
  const extras = allItems.filter(
    (item) => ephemeralIds.includes(item.session.id) && !visibleIds.has(item.session.id)
  );
  return [...visibleItems, ...extras];
}

export interface SessionListProps {
  sessionItems: SidebarSessionItem[];
  listKey: string;
  workspaceId?: string;
  interactive?: boolean;
  allowStandaloneReorder?: boolean;
  onSelectSession: (id: string) => void;
  onPinSession: (sessionId: string) => void;
  onUnpinSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onArchiveSession: (sessionId: string) => void;
  onMarkSessionRead: (sessionId: string) => void;
  onMarkSessionUnread: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onReorderSessions: (input: ReorderSessionsInput) => void;
  activeSessionId?: string;
  locale: Locale;
  t: CopyDict;
  onSessionContextMenu?: (sessionId: string, x: number, y: number) => void;
}

export function SessionList({
  sessionItems,
  listKey,
  workspaceId,
  interactive = true,
  allowStandaloneReorder = false,
  onSelectSession,
  onPinSession,
  onUnpinSession,
  onRenameSession,
  onArchiveSession,
  onMarkSessionRead,
  onMarkSessionUnread,
  onDeleteSession,
  onReorderSessions,
  activeSessionId,
  locale,
  t,
  onSessionContextMenu,
}: SessionListProps) {
  const [dragSessionId, setDragSessionId] = useState<string>();
  const [dragOverSessionId, setDragOverSessionId] = useState<string>();
  const [droppedSessionId, setDroppedSessionId] = useState<string>();
  const [expandedSessionLists, setExpandedSessionLists] = useState<Record<string, boolean>>({});
  const [ephemeralVisibleSessionIds, setEphemeralVisibleSessionIds] = useState<
    Record<string, string[]>
  >({});
  const [hoveredSessionId, setHoveredSessionId] = useState<string>();
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [sessionToRename, setSessionToRename] = useState<{ id: string; name: string } | null>(null);

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

  const handleStartRename = useCallback((sessionId: string, sessionName: string) => {
    setSessionToRename({ id: sessionId, name: sessionName });
    setRenameDialogOpen(true);
  }, []);

  const handleConfirmRename = useCallback(
    (newName: string) => {
      if (sessionToRename) {
        onRenameSession(sessionToRename.id, newName);
      }
      setRenameDialogOpen(false);
      setSessionToRename(null);
    },
    [sessionToRename, onRenameSession]
  );

  const handleCancelRename = useCallback(() => {
    setRenameDialogOpen(false);
    setSessionToRename(null);
  }, []);

  const removeEphemeralVisibleSessionId = useCallback((listKeyInner: string, sessionId: string) => {
    setEphemeralVisibleSessionIds((current) => {
      if (!(current[listKeyInner] ?? []).includes(sessionId)) {
        return current;
      }
      return {
        ...current,
        [listKeyInner]: (current[listKeyInner] ?? []).filter((id) => id !== sessionId),
      };
    });
  }, []);

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
      const pinnedIds = isPinnedBucket
        ? nextIds
        : sessionItems.filter((item) => item.session.isPinned).map((item) => item.session.id);
      const unpinnedIds = isPinnedBucket
        ? sessionItems.filter((item) => !item.session.isPinned).map((item) => item.session.id)
        : nextIds;
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
      const pinnedIds = isPinnedBucket
        ? nextIds
        : sessionItems.filter((item) => item.session.isPinned).map((item) => item.session.id);
      const unpinnedIds = isPinnedBucket
        ? sessionItems.filter((item) => !item.session.isPinned).map((item) => item.session.id)
        : nextIds;
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
      const pinnedIds = isPinnedBucket
        ? nextIds
        : sessionItems.filter((item) => item.session.isPinned).map((item) => item.session.id);
      const unpinnedIds = isPinnedBucket
        ? sessionItems.filter((item) => !item.session.isPinned).map((item) => item.session.id)
        : nextIds;
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

  const expanded = expandedSessionLists[listKey] ?? false;
  const tailDropTargetId = `${listKey}::tail`;
  const visibleItems = useMemo(() => {
    const visibleSessions = getVisibleSidebarSessions(sessionItems, expanded);
    return expanded
      ? visibleSessions.items
      : mergeEphemeralVisibleSessions(
          sessionItems,
          visibleSessions.items,
          ephemeralVisibleSessionIds[listKey] ?? []
        );
  }, [sessionItems, expanded, listKey, ephemeralVisibleSessionIds]);
  const hiddenCount = Math.max(0, sessionItems.length - visibleItems.length);
  const canReorder = interactive && (Boolean(workspaceId) || Boolean(allowStandaloneReorder));
  const draggedSessionItem = dragSessionId
    ? sessionItems.find((item) => item.session.id === dragSessionId)
    : undefined;
  const lastVisibleInBucket = draggedSessionItem
    ? [...visibleItems]
        .reverse()
        .find((item) => item.session.isPinned === draggedSessionItem.session.isPinned)
    : undefined;

  const canDropTail = canReorder && !!draggedSessionItem;

  const renderedItems = useMemo(
    () =>
      visibleItems.map((sessionItem) => {
        const isHovered = hoveredSessionId === sessionItem.session.id;
        const canReorderIntoTarget =
          Boolean(draggedSessionItem) &&
          draggedSessionItem?.session.id !== sessionItem.session.id &&
          draggedSessionItem?.session.isPinned === sessionItem.session.isPinned &&
          (Boolean(workspaceId) || Boolean(allowStandaloneReorder));
        const isDropTarget = dragOverSessionId === sessionItem.session.id && canReorderIntoTarget;
        const isHighlighted = sessionToRename?.id === sessionItem.session.id;
        return (
          <SessionListRow
            key={sessionItem.session.id}
            sessionItem={sessionItem}
            activeSessionId={activeSessionId}
            droppedSessionId={droppedSessionId}
            isDropTarget={isDropTarget}
            isHighlighted={isHighlighted}
            isHovered={isHovered}
            canReorder={canReorder}
            canReorderIntoTarget={canReorderIntoTarget}
            draggedSessionItem={draggedSessionItem}
            workspaceId={workspaceId}
            interactive={interactive}
            locale={locale}
            t={t}
            onSelectSession={onSelectSession}
            onPinSession={onPinSession}
            onUnpinSession={onUnpinSession}
            onArchiveSession={onArchiveSession}
            onSessionContextMenu={onSessionContextMenu}
            handleStartRename={handleStartRename}
            handleSessionDrop={handleSessionDrop}
            setHoveredSessionId={setHoveredSessionId}
            setDragSessionId={setDragSessionId}
            setDragOverSessionTarget={setDragOverSessionTarget}
          />
        );
      }),
    [
      visibleItems,
      hoveredSessionId,
      draggedSessionItem,
      canReorder,
      sessionToRename,
      dragOverSessionId,
      activeSessionId,
      droppedSessionId,
      workspaceId,
      interactive,
      locale,
      t,
      allowStandaloneReorder,
      onSelectSession,
      onPinSession,
      onUnpinSession,
      onArchiveSession,
      onSessionContextMenu,
      handleStartRename,
      handleSessionDrop,
      setHoveredSessionId,
      setDragSessionId,
      setDragOverSessionTarget,
    ]
  );

  return (
    <>
      {renderedItems}
      {canDropTail && !!draggedSessionItem ? (
        <li
          className={`adl-session-row adl-session-row--tail${dragOverSessionId === tailDropTargetId ? ' is-drop-target is-reorderable-target' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            if (lastVisibleInBucket) {
              setDragOverSessionTarget(tailDropTargetId);
            }
          }}
          onDrop={() => {
            if (workspaceId) {
              handleSessionDropToBucketEnd(draggedSessionItem.session.isPinned);
            }
          }}
        />
      ) : null}
      {renderSessionLimitControl(
        listKey,
        hiddenCount,
        expanded,
        t,
        setExpandedSessionLists,
        canDropTail && !!draggedSessionItem
          ? {
              canDropToTail: true,
              isTailDropTarget: dragOverSessionId === tailDropTargetId,
              onTailDragOver: (event: React.DragEvent<HTMLLIElement>) => {
                event.preventDefault();
                setDragOverSessionTarget(tailDropTargetId);
              },
              onTailDrop: () => {
                const shouldDropAfterVisibleTail =
                  !expanded && hiddenCount > 0 && lastVisibleInBucket;
                if (workspaceId) {
                  if (shouldDropAfterVisibleTail) {
                    handleSessionDropAfterVisibleTarget(
                      lastVisibleInBucket.session.id,
                      draggedSessionItem.session.isPinned
                    );
                  } else {
                    handleSessionDropToBucketEnd(draggedSessionItem.session.isPinned);
                  }
                }
              },
              onTailDragLeave: undefined,
            }
          : undefined
      )}
      {sessionToRename && (
        <RenameDialog
          open={renameDialogOpen}
          initialValue={sessionToRename.name}
          title="重命名会话"
          itemInfo={`当前名称: ${sessionToRename.name}`}
          placeholder="输入新会话名称"
          onConfirm={handleConfirmRename}
          onCancel={handleCancelRename}
        />
      )}
    </>
  );
}

function renderSessionLimitControl(
  listKey: string,
  hiddenCount: number,
  expanded: boolean,
  t: CopyDict,
  setExpandedSessionLists: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
  options?: {
    canDropToTail?: boolean;
    isTailDropTarget?: boolean;
    onTailDragOver?: (event: React.DragEvent<HTMLLIElement>) => void;
    onTailDragLeave?: (event: React.DragEvent<HTMLLIElement>) => void;
    onTailDrop?: () => void;
  }
) {
  if (hiddenCount === 0 && !expanded) {
    return null;
  }

  return (
    <li
      className={`adl-session-list__limit-item${options?.canDropToTail ? ' adl-session-row adl-session-row--tail adl-session-row--tail-control adl-session-row--reorder-zone' : ''}${options?.isTailDropTarget ? ' is-drop-target is-reorderable-target' : ''}`}
      onDragOver={options?.onTailDragOver}
      onDragLeave={options?.onTailDragLeave}
      onDrop={options?.onTailDrop}
    >
      <button
        type="button"
        className="adl-session-list__limit"
        onClick={() =>
          setExpandedSessionLists((current) => ({
            ...current,
            [listKey]: !expanded,
          }))
        }
      >
        {expanded ? t.collapseSessions : `${t.showMoreSessions} ${hiddenCount}`}
      </button>
    </li>
  );
}
