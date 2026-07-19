import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ReorderWorkspacesInput } from '@ai-digital-life/kernel';
import {
  IconArchive,
  IconCollapseRows,
  IconExpandRows,
  IconMoreVertical,
  IconPin,
  IconPinOff,
  IconPlus,
} from '../../icons';
import { TooltipSimple } from '../../components/Tooltip';
import type { SidebarSessionItem, SidebarWorkspaceItem } from '../../utils/sidebarViewModel';
import { STATUS_LABEL, buildWorkspaceTooltip } from './SidebarContextMenu.utils';
import { WorkspaceDirectoryIcon, StatusLamp } from './SidebarContextMenu';
import { useTCopy } from '../../i18n/useTCopy';

export interface WorkspaceListProps {
  workspaceItems: SidebarWorkspaceItem[];
  expandedSessionWorkspaces: Record<string, boolean>;
  toggleSessionWorkspace: (workspaceId: string) => void;
  onReorderWorkspaces: (input: ReorderWorkspacesInput) => void;
  onSwitchToWorkspace: (workspaceId: string, workspacePath: string) => void;
  onPinWorkspace: (workspaceId: string) => void;
  onUnpinWorkspace: (workspaceId: string) => void;
  onCreateSession: () => void;
  onTriggerCreateWorkspace: () => void;
  onSelectSession: (sessionId: string) => void;
  onContextMenu: (workspaceId: string, x: number, y: number) => void;
  renderSessionRows: (
    sessionItems: SidebarSessionItem[],
    options: {
      listKey: string;
      workspaceId?: string;
      interactive?: boolean;
      allowStandaloneReorder?: boolean;
    }
  ) => React.ReactNode;
  workspaceToolbarRef: React.RefObject<HTMLDivElement | null>;
}

import { moveIdAfterTarget, moveIdBeforeTarget } from '../../utils/dragUtils';

interface DragSession {
  draggedId: string;
  startY: number;
  isDragging: boolean;
  isPinned: boolean;
}

export function WorkspaceList({
  workspaceItems,
  expandedSessionWorkspaces,
  toggleSessionWorkspace,
  onReorderWorkspaces,
  onSwitchToWorkspace,
  onPinWorkspace,
  onUnpinWorkspace,
  onCreateSession,
  onTriggerCreateWorkspace,
  onSelectSession,
  onContextMenu,
  renderSessionRows,
  workspaceToolbarRef,
}: WorkspaceListProps) {
  const { t } = useTCopy();
  const [archiveOpen, setArchiveOpen] = useState(false);

  // Mouse-based drag state
  const dragSessionRef = useRef<DragSession | null>(null);
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);
  const [dragTargetPosition, setDragTargetPosition] = useState<'before' | 'after'>('after');
  const targetIdRef = useRef<string | null>(null);
  const targetPosRef = useRef<'before' | 'after'>('after');

  // Keep refs current to avoid stale closures in document listeners
  const workspaceItemsRef = useRef(workspaceItems);
  workspaceItemsRef.current = workspaceItems;
  const onReorderRef = useRef(onReorderWorkspaces);
  onReorderRef.current = onReorderWorkspaces;

  // Persistent document-level listeners for drag tracking
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;

      if (!session.isDragging) {
        if (Math.abs(e.clientY - session.startY) <= 4) return;
        session.isDragging = true;
        setDragActiveId(session.draggedId);
      }

      const ul = document.querySelector('.adl-workspace-list');
      if (!ul) return;

      const items = ul.querySelectorAll<HTMLLIElement>('li[data-ws-id]');
      if (items.length === 0) return;

      let foundId: string | null = null;
      let foundPos: 'before' | 'after' = 'after';

      // Edge: cursor above first item's top edge → target first item (before)
      const firstRect = items[0].getBoundingClientRect();
      if (e.clientY < firstRect.top) {
        const firstId = items[0].getAttribute('data-ws-id');
        if (firstId && firstId !== session.draggedId) {
          foundId = firstId;
          foundPos = 'before';
        }
      }
      // Edge: cursor below last item's bottom edge → target last item (after)
      else {
        const lastRect = items[items.length - 1].getBoundingClientRect();
        if (e.clientY > lastRect.bottom) {
          const lastId = items[items.length - 1].getAttribute('data-ws-id');
          if (lastId && lastId !== session.draggedId) {
            foundId = lastId;
            foundPos = 'after';
          }
        }
      }

      // Normal: find closest item
      if (!foundId) {
        let minDist = Infinity;
        let closestId: string | null = null;
        let closestPos: 'before' | 'after' = 'after';
        for (const item of items) {
          const id = item.getAttribute('data-ws-id');
          if (!id || id === session.draggedId) continue;

          const rect = item.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          const dist = Math.abs(e.clientY - midY);

          if (dist < minDist) {
            minDist = dist;
            closestId = id;
            closestPos = e.clientY < midY ? 'before' : 'after';
          }
        }
        if (closestId) {
          foundId = closestId;
          foundPos = closestPos;
        }
      }

      if (foundId) {
        if (foundId !== targetIdRef.current || foundPos !== targetPosRef.current) {
          targetIdRef.current = foundId;
          targetPosRef.current = foundPos;
          setDragTargetId(foundId);
          setDragTargetPosition(foundPos);
        }
      }
    };

    const cleanupDrag = () => {
      dragSessionRef.current = null;
      targetIdRef.current = null;
      targetPosRef.current = 'after';
      setDragActiveId(null);
      setDragTargetId(null);
    };

    const handleMouseUp = () => {
      const session = dragSessionRef.current;
      if (!session) {
        return;
      }

      if (session.isDragging) {
        const targetId = targetIdRef.current;
        if (targetId && targetId !== session.draggedId) {
          try {
            const items = workspaceItemsRef.current;
            const onReorder = onReorderRef.current;
            const isPinnedBucket = session.isPinned;
            const bucketItems = items
              .filter((w) => w.workspace.isPinned === isPinnedBucket)
              .map((w) => w.workspace.id);

            if (bucketItems.includes(session.draggedId) && bucketItems.includes(targetId)) {
              const useAfter = targetPosRef.current === 'after';
              const nextIds = useAfter
                ? moveIdAfterTarget(bucketItems, session.draggedId, targetId)
                : moveIdBeforeTarget(bucketItems, session.draggedId, targetId);

              const pinnedIds = isPinnedBucket
                ? nextIds
                : items.filter((w) => w.workspace.isPinned).map((w) => w.workspace.id);
              const unpinnedIds = isPinnedBucket
                ? items.filter((w) => !w.workspace.isPinned).map((w) => w.workspace.id)
                : nextIds;

              onReorder({ pinnedIds, unpinnedIds });
            }
          } catch {
            // ignore reorder error
          }
        }
      }

      cleanupDrag();
    };

    const handleBlur = () => {
      cleanupDrag();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('pointerup', handleMouseUp);
    window.addEventListener('pointercancel', handleBlur);
    window.addEventListener('blur', handleBlur);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('pointerup', handleMouseUp);
      window.removeEventListener('pointercancel', handleBlur);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const handleRowMouseDown = useCallback(
    (event: React.MouseEvent, wsId: string, isPinned: boolean) => {
      if (event.button !== 0) return;
      event.preventDefault();
      (event.currentTarget as HTMLElement).blur();
      dragSessionRef.current = {
        draggedId: wsId,
        startY: event.clientY,
        isDragging: false,
        isPinned,
      };
    },
    []
  );

  return (
    <section className="adl-leftbar__nav" aria-label={t.workspaces}>
      <div className="adl-workspace-toolbar" ref={workspaceToolbarRef}>
        <div className="adl-section-toolbar__title">
          <span className="adl-section-toolbar__label">{t.projects}</span>
          <TooltipSimple
            content={
              workspaceItems.every(
                (item) => expandedSessionWorkspaces[item.workspace.path] ?? item.isCurrent
              )
                ? t.collapseSessions
                : t.expand
            }
            placement="right"
          >
            <button
              type="button"
              className="adl-icon-btn adl-icon-btn--xs"
              onClick={() => {
                const allExpanded = workspaceItems.every(
                  (item) => expandedSessionWorkspaces[item.workspace.path] ?? item.isCurrent
                );
                for (const item of workspaceItems) {
                  const shouldBeExpanded = !allExpanded;
                  if (
                    shouldBeExpanded !==
                    (expandedSessionWorkspaces[item.workspace.path] ?? item.isCurrent)
                  ) {
                    toggleSessionWorkspace(item.workspace.path);
                  }
                }
              }}
              aria-label={
                workspaceItems.every(
                  (item) => expandedSessionWorkspaces[item.workspace.path] ?? item.isCurrent
                )
                  ? t.collapseSessions
                  : t.expand
              }
            >
              {workspaceItems.every(
                (item) => expandedSessionWorkspaces[item.workspace.path] ?? item.isCurrent
              ) ? (
                <IconCollapseRows size={14} decorative />
              ) : (
                <IconExpandRows size={14} decorative />
              )}
            </button>
          </TooltipSimple>
        </div>
        <TooltipSimple content={t.quickNewWorkspace} placement="right">
          <button
            type="button"
            className="adl-icon-btn adl-icon-btn--xs"
            onClick={onTriggerCreateWorkspace}
            aria-label={t.quickNewWorkspace}
          >
            <IconPlus size={14} decorative />
          </button>
        </TooltipSimple>
      </div>

      <ul className="adl-workspace-list" role="tree">
        {workspaceItems.length === 0 ? (
          <li className="adl-empty-hint">{t.workspaceEmpty}</li>
        ) : null}
        {workspaceItems.map((item) => {
          const expanded = expandedSessionWorkspaces[item.workspace.path] ?? item.isCurrent;
          const workspaceStatusLabel = t[STATUS_LABEL[item.rollupStatus]] as string;
          const isDragging = dragActiveId === item.workspace.id;
          const isTarget = dragTargetId === item.workspace.id;
          const targetCls = isTarget
            ? dragTargetPosition === 'before'
              ? ' is-drag-target-before'
              : ' is-drag-target-after'
            : '';

          return (
            <li
              key={item.workspace.id}
              className={`adl-workspace-item${item.isCurrent ? ' is-current' : ''}${isDragging ? ' is-dragging' : ''}${targetCls}`}
              data-ws-id={item.workspace.id}
            >
              <div
                className="adl-workspace-row"
                role="treeitem"
                aria-expanded={expanded}
                onClick={() => {
                  if (!item.isCurrent) {
                    onSwitchToWorkspace(item.workspace.id, item.workspace.path);
                    return;
                  }
                  toggleSessionWorkspace(item.workspace.path);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onContextMenu(item.workspace.id, event.clientX, event.clientY);
                }}
              >
                <span className="adl-workspace-row__leading">
                  {expanded ? (
                    <TooltipSimple content={t.workspaces} placement="right">
                      <WorkspaceDirectoryIcon
                        expanded
                        status={item.rollupStatus}
                        title={workspaceStatusLabel}
                      />
                    </TooltipSimple>
                  ) : (
                    <TooltipSimple
                      content={buildWorkspaceTooltip(t, item.statusCounts)}
                      placement="right"
                    >
                      <WorkspaceDirectoryIcon
                        expanded={false}
                        status={item.rollupStatus}
                        title={workspaceStatusLabel}
                      />
                    </TooltipSimple>
                  )}
                </span>

                <button
                  type="button"
                  className="adl-workspace-row__label"
                  title={item.workspace.path}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!item.isCurrent) {
                      onSwitchToWorkspace(item.workspace.id, item.workspace.path);
                    } else {
                      toggleSessionWorkspace(item.workspace.path);
                    }
                  }}
                  onMouseDown={(event) =>
                    handleRowMouseDown(event, item.workspace.id, item.workspace.isPinned)
                  }
                >
                  <span>{item.workspace.name}</span>
                </button>

                <div className="adl-workspace-row__tail">
                  <span className="adl-workspace-row__secondary">
                    <TooltipSimple
                      content={item.workspace.isPinned ? t.sessionMenuUnpin : t.sessionMenuPin}
                      placement="right"
                    >
                      <button
                        type="button"
                        className="adl-workspace-row__pin"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (item.workspace.isPinned) {
                            onUnpinWorkspace(item.workspace.id);
                          } else {
                            onPinWorkspace(item.workspace.id);
                          }
                        }}
                        aria-label={item.workspace.isPinned ? t.sessionMenuUnpin : t.sessionMenuPin}
                      >
                        {item.workspace.isPinned ? (
                          <IconPinOff size={12} decorative />
                        ) : (
                          <IconPin size={12} decorative />
                        )}
                      </button>
                    </TooltipSimple>
                  </span>

                  <div className="adl-workspace-row__actions">
                    <TooltipSimple content={t.newSession} placement="right">
                      <button
                        type="button"
                        className="adl-icon-btn adl-icon-btn--xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (item.isCurrent) {
                            onCreateSession();
                          }
                        }}
                        disabled={!item.isCurrent}
                        aria-label={t.newSession}
                      >
                        <IconPlus size={12} decorative />
                      </button>
                    </TooltipSimple>
                    <TooltipSimple content={t.menuSettings} placement="right">
                      <button
                        type="button"
                        className="adl-icon-btn adl-icon-btn--xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          const rect = event.currentTarget.getBoundingClientRect();
                          onContextMenu(item.workspace.id, rect.right, rect.bottom + 4);
                        }}
                        aria-label={t.menuSettings}
                      >
                        <IconMoreVertical size={12} decorative />
                      </button>
                    </TooltipSimple>
                  </div>
                </div>
              </div>

              {expanded ? (
                <div className="adl-session-wrapper">
                  <ul className="adl-session-list" role="group">
                    {item.sessions.length === 0 ? (
                      <li className="adl-empty-hint adl-empty-hint--nested">{t.sessionEmpty}</li>
                    ) : null}
                    {renderSessionRows(item.sessions, {
                      listKey: `workspace:${item.workspace.id}`,
                      workspaceId: item.workspace.id,
                    })}
                  </ul>

                  {item.archivedSessions.length > 0 ? (
                    <details
                      className="adl-archive"
                      open={archiveOpen}
                      onToggle={(event) => setArchiveOpen(event.currentTarget.open)}
                    >
                      <summary>
                        <IconArchive size={12} decorative />
                        <span>{t.sessionMenuArchive}</span>
                        <span className="adl-badge">{item.archivedSessions.length}</span>
                      </summary>
                      <ul>
                        {item.archivedSessions.map((sessionItem) => (
                          <li key={sessionItem.session.id}>
                            <button
                              type="button"
                              className="adl-session-item adl-session-item--archived"
                              onClick={() => onSelectSession(sessionItem.session.id)}
                            >
                              <span className="adl-session-item__indicator" aria-hidden="true">
                                <StatusLamp status="read" title={t.statusRead} />
                              </span>
                              <span className="adl-session-item__title">
                                <span className="adl-session-item__title-text">
                                  {sessionItem.session.title}
                                </span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
