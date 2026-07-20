import React, { useState } from 'react';
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
import { useWorkspaceDrag } from './useWorkspaceDrag';
import { useWorkspacePin } from './useWorkspacePin';

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
    },
  ) => React.ReactNode;
  workspaceToolbarRef: React.RefObject<HTMLDivElement | null>;
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

  const { draggedItemId, localOrder, handleDragStart } = useWorkspaceDrag(
    workspaceItems,
    onReorderWorkspaces,
  );
  const { handleTogglePin } = useWorkspacePin(workspaceItems, onPinWorkspace, onUnpinWorkspace);

  return (
    <section className="adl-leftbar__nav" aria-label={t.workspaces}>
      <div className="adl-workspace-toolbar" ref={workspaceToolbarRef}>
        <div className="adl-section-toolbar__title">
          <span className="adl-section-toolbar__label">{t.projects}</span>
          <TooltipSimple
            content={
              workspaceItems.every(
                (item) => expandedSessionWorkspaces[item.workspace.path] ?? item.isCurrent,
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
                  (item) => expandedSessionWorkspaces[item.workspace.path] ?? item.isCurrent,
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
                  (item) => expandedSessionWorkspaces[item.workspace.path] ?? item.isCurrent,
                )
                  ? t.collapseSessions
                  : t.expand
              }
            >
              {workspaceItems.every(
                (item) => expandedSessionWorkspaces[item.workspace.path] ?? item.isCurrent,
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
        {(() => {
          const itemById = new Map(workspaceItems.map((w) => [w.workspace.id, w] as const));
          const orderedItems = localOrder
            .map((id) => itemById.get(id))
            .filter((x): x is SidebarWorkspaceItem => x != null);
          return orderedItems.map((item) => {
            const expanded = expandedSessionWorkspaces[item.workspace.path] ?? item.isCurrent;
            const workspaceStatusLabel = t[STATUS_LABEL[item.rollupStatus]] as string;
            const isDragging = draggedItemId === item.workspace.id;

            return (
              <li
                key={item.workspace.id}
                className={`adl-workspace-item${item.isCurrent ? ' is-current' : ''}${isDragging ? ' is-dragging' : ''}`}
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
                      handleDragStart(event, item.workspace.id, item.workspace.isPinned)
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
                            handleTogglePin(item.workspace.id);
                          }}
                          aria-label={
                            item.workspace.isPinned ? t.sessionMenuUnpin : t.sessionMenuPin
                          }
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
          });
        })()}
      </ul>
    </section>
  );
}
