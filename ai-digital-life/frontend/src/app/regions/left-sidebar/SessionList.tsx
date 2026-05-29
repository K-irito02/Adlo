import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ReorderSessionsInput } from "@ai-digital-life/kernel";
import type { CopyDict, Locale } from "../../copy";
import { IconArchive, IconMoreVertical, IconPin, IconPinOff } from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";
import { RenameDialog } from "../../components/RenameDialog";
import { getVisibleSidebarSessions, type SidebarSessionItem } from "../../sidebarViewModel";
import { STATUS_LABEL, StatusLamp } from "./SidebarContextMenu";

import { moveIdWithinBucket, moveIdToBucketEnd, moveIdAfterTarget } from "../../utils/dragUtils";

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
  const extras = allItems.filter((item) => ephemeralIds.includes(item.session.id) && !visibleIds.has(item.session.id));
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
  onSessionContextMenu
}: SessionListProps) {
  const [dragSessionId, setDragSessionId] = useState<string>();
  const [dragOverSessionId, setDragOverSessionId] = useState<string>();
  const [droppedSessionId, setDroppedSessionId] = useState<string>();
  const [expandedSessionLists, setExpandedSessionLists] = useState<Record<string, boolean>>({});
  const [ephemeralVisibleSessionIds, setEphemeralVisibleSessionIds] = useState<Record<string, string[]>>({});
  const [hoveredSessionId, setHoveredSessionId] = useState<string>();
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [sessionToRename, setSessionToRename] = useState<{ id: string; name: string } | null>(null);

  const dropFlashTimeoutRef = useRef<number | null>(null);
  const dragOverSessionIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (dropFlashTimeoutRef.current) {
        window.clearTimeout(dropFlashTimeoutRef.current);
        dropFlashTimeoutRef.current = null;
      }
    };
  }, []);

  const setDragOverSessionTarget = useCallback((nextSessionId: string | undefined) => {
    if (dragOverSessionIdRef.current === nextSessionId) {
      return;
    }
    dragOverSessionIdRef.current = nextSessionId;
    setDragOverSessionId(nextSessionId);
  }, []);

  const flashDroppedSession = useCallback((sessionId: string) => {
    if (dropFlashTimeoutRef.current) {
      window.clearTimeout(dropFlashTimeoutRef.current);
    }
    setDroppedSessionId(sessionId);
    dropFlashTimeoutRef.current = window.setTimeout(() => {
      setDroppedSessionId((current) => (current === sessionId ? undefined : current));
      dropFlashTimeoutRef.current = null;
    }, DROP_FLASH_DURATION_MS);
  }, []);

  const handleStartRename = useCallback(
    (sessionId: string, sessionName: string) => {
      setSessionToRename({ id: sessionId, name: sessionName });
      setRenameDialogOpen(true);
    },
    []
  );

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
        [listKeyInner]: (current[listKeyInner] ?? []).filter((id) => id !== sessionId)
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
    [dragSessionId, flashDroppedSession, onReorderSessions, sessionItems, setDragOverSessionTarget, workspaceId]
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
    [dragSessionId, flashDroppedSession, onReorderSessions, sessionItems, setDragOverSessionTarget, workspaceId]
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
    [dragSessionId, flashDroppedSession, onReorderSessions, sessionItems, setDragOverSessionTarget, workspaceId]
  );

  const expanded = expandedSessionLists[listKey] ?? false;
  const tailDropTargetId = `${listKey}::tail`;
  const visibleSessions = getVisibleSidebarSessions(sessionItems, expanded);
  const visibleItems = expanded
    ? visibleSessions.items
    : mergeEphemeralVisibleSessions(sessionItems, visibleSessions.items, ephemeralVisibleSessionIds[listKey] ?? []);
  const hiddenCount = Math.max(0, sessionItems.length - visibleItems.length);
  const canReorder = interactive && (Boolean(workspaceId) || Boolean(allowStandaloneReorder));
  const draggedSessionItem = dragSessionId ? sessionItems.find((item) => item.session.id === dragSessionId) : undefined;
  const lastVisibleInBucket = draggedSessionItem
    ? [...visibleItems].reverse().find((item) => item.session.isPinned === draggedSessionItem.session.isPinned)
    : undefined;

  return (
    <>
      {visibleItems.map((sessionItem) => {
        const isHovered = hoveredSessionId === sessionItem.session.id;
        const statusLabel = t[STATUS_LABEL[sessionItem.status]] as string;
        const canReorderIntoTarget =
          Boolean(draggedSessionItem) &&
          draggedSessionItem?.session.id !== sessionItem.session.id &&
          draggedSessionItem?.session.isPinned === sessionItem.session.isPinned &&
          (Boolean(workspaceId) || Boolean(allowStandaloneReorder));
        const isDropTarget =
          dragOverSessionId === sessionItem.session.id &&
          canReorderIntoTarget;
        const isHighlighted = sessionToRename?.id === sessionItem.session.id;
        return (
          <li
            key={sessionItem.session.id}
            className={`adl-session-row${dragSessionId === sessionItem.session.id ? " is-dragging" : ""}${isDropTarget ? " is-drop-target" : ""}${canReorderIntoTarget ? " is-reorderable-target" : ""}`}
            draggable={canReorder}
            onDragStart={(event) => {
              if (interactive) {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", sessionItem.session.id);
                setDragSessionId(sessionItem.session.id);
                setDragOverSessionTarget(undefined);
              }
            }}
            onDragEnd={() => {
              setDragSessionId(undefined);
              setDragOverSessionTarget(undefined);
            }}
            onDragOver={(event) => {
              if (interactive) {
                event.preventDefault();
                if (canReorderIntoTarget) {
                  setDragOverSessionTarget(sessionItem.session.id);
                }
              }
            }}
            onDrop={() =>
              interactive
                ? workspaceId
                  ? handleSessionDrop(sessionItem.session.id, sessionItem.session.isPinned)
                  : undefined
                : undefined
            }
          >
            <div
              role="button"
              tabIndex={0}
              className={`adl-session-item${sessionItem.session.id === activeSessionId ? " is-active" : ""}${dragSessionId === sessionItem.session.id ? " is-dragging" : ""}${isDropTarget ? " is-drop-target" : ""}${droppedSessionId === sessionItem.session.id ? " is-drop-flash" : ""}${isHighlighted ? " is-highlighted" : ""}`}
              onMouseEnter={() => setHoveredSessionId(sessionItem.session.id)}
              onMouseLeave={() => setHoveredSessionId((current) => (current === sessionItem.session.id ? undefined : current))}
              onContextMenu={(event) => {
                if (!interactive) {
                  return;
                }
                event.preventDefault();
                if (onSessionContextMenu) {
                  onSessionContextMenu(sessionItem.session.id, event.clientX, event.clientY);
                }
              }}
              onClick={() => {
                if (interactive) {
                  onSelectSession(sessionItem.session.id);
                }
              }}
              onKeyDown={(event) => {
                if (!interactive) {
                  return;
                }
                if (event.target !== event.currentTarget) {
                  return;
                }
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectSession(sessionItem.session.id);
                }
              }}
              onDoubleClick={() => {
                if (!interactive) {
                  return;
                }
                handleStartRename(sessionItem.session.id, sessionItem.session.title);
              }}
            >
              {isHovered && interactive ? (
                <button
                  type="button"
                  className="adl-session-item__indicator"
                  aria-label={sessionItem.session.isPinned ? t.sessionMenuUnpin : t.sessionMenuPin}
                  onClick={(event) => {
                    event.stopPropagation();
                    sessionItem.session.isPinned ? onUnpinSession(sessionItem.session.id) : onPinSession(sessionItem.session.id);
                  }}
                >
                  {sessionItem.session.isPinned ? <IconPinOff size={12} decorative /> : <IconPin size={12} decorative />}
                </button>
              ) : (
                <span className="adl-session-item__indicator adl-session-item__indicator--static" aria-hidden="true">
                  <StatusLamp status={sessionItem.status} title={statusLabel} />
                </span>
              )}

              <TooltipSimple content={sessionItem.session.title} placement="right">
                <span className="adl-session-item__title">
                  <span className="adl-session-item__title-text">{sessionItem.session.title}</span>
                </span>
              </TooltipSimple>

              {isHovered && interactive ? (
                <span className="adl-session-item__actions" onClick={(event) => event.stopPropagation()}>
                  <TooltipSimple content={t.sessionMenuArchive} placement="right">
                    <button
                      type="button"
                      className="adl-icon-btn adl-icon-btn--xs"
                      onClick={() => onArchiveSession(sessionItem.session.id)}
                      aria-label={t.sessionMenuArchive}
                    >
                      <IconArchive size={12} decorative />
                    </button>
                  </TooltipSimple>
                  <TooltipSimple content={t.menuSettings} placement="right">
                    <button
                      type="button"
                      className="adl-icon-btn adl-icon-btn--xs"
                      onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        if (onSessionContextMenu) {
                          onSessionContextMenu(sessionItem.session.id, rect.right, rect.bottom + 4);
                        }
                      }}
                      aria-label={t.menuSettings}
                    >
                      <IconMoreVertical size={12} decorative />
                    </button>
                  </TooltipSimple>
                </span>
              ) : (
                <span className="adl-session-item__meta">
                  {new Date(sessionItem.session.updatedAt).toLocaleString(locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                    month: "2-digit",
                    day: "2-digit"
                  })}
                </span>
              )}
            </div>
          </li>
        );
      })}
      {canReorder && draggedSessionItem ? (
        <li
          className={`adl-session-row adl-session-row--tail${dragOverSessionId === tailDropTargetId ? " is-drop-target is-reorderable-target" : ""}`}
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
        canReorder && draggedSessionItem ? {
          canDropToTail: true,
          isTailDropTarget: dragOverSessionId === tailDropTargetId,
          onTailDragOver: (event: React.DragEvent<HTMLLIElement>) => {
            event.preventDefault();
            setDragOverSessionTarget(tailDropTargetId);
          },
          onTailDrop: () => {
            const shouldDropAfterVisibleTail = !expanded && hiddenCount > 0 && lastVisibleInBucket;
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
          onTailDragLeave: undefined
        } : undefined
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
      className={`adl-session-list__limit-item${options?.canDropToTail ? " adl-session-row adl-session-row--tail adl-session-row--tail-control adl-session-row--reorder-zone" : ""}${options?.isTailDropTarget ? " is-drop-target is-reorderable-target" : ""}`}
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
            [listKey]: !expanded
          }))
        }
      >
        {expanded ? t.collapseSessions : `${t.showMoreSessions} ${hiddenCount}`}
      </button>
    </li>
  );
}
