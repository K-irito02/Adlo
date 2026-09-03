import { useMemo } from 'react';
import type { RecentWorkspaceEntry, ReorderWorkspacesInput } from '@ai-digital-life/kernel';
import { IconFolder, IconMoreVertical, IconPin, IconPinOff, IconPlus } from '../../icons';
import { TooltipSimple } from '../../components/Tooltip';
import { useTCopy } from '../../i18n/useTCopy';
import { useWorkspaceDrag } from './useWorkspaceDrag';
import { useWorkspacePin } from './useWorkspacePin';
import { DragOverlayPortal } from '../../components/drag/DragOverlayPortal';

export interface WorkspaceListProps {
  workspaceItems: RecentWorkspaceEntry[];
  currentWorkspace?: { id: string; path: string };
  onReorderWorkspaces: (input: ReorderWorkspacesInput) => void;
  onPinWorkspace: (workspaceId: string) => void;
  onUnpinWorkspace: (workspaceId: string) => void;
  onTriggerCreateWorkspace: () => void;
  onContextMenu: (workspaceId: string, x: number, y: number) => void;
}

/** 路径归一化 key：分隔符统一 + 小写 + 去尾部斜杠，与后端 workspace_sidebar 的去重规则对齐。 */
function pathDedupKey(path: string): string {
  const normalized = path.replace(/\\/g, '/').toLowerCase();
  const trimmed = normalized.replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : normalized;
}

function isCurrentWorkspace(
  workspace: RecentWorkspaceEntry,
  currentWorkspace?: { id: string; path: string },
): boolean {
  if (!currentWorkspace) {
    return false;
  }
  return (
    workspace.id === currentWorkspace.id ||
    pathDedupKey(workspace.path) === pathDedupKey(currentWorkspace.path)
  );
}

export function WorkspaceList({
  workspaceItems,
  currentWorkspace,
  onReorderWorkspaces,
  onPinWorkspace,
  onUnpinWorkspace,
  onTriggerCreateWorkspace,
  onContextMenu,
}: WorkspaceListProps) {
  const { t } = useTCopy();

  const visibleItems = useMemo(
    () => workspaceItems.filter((workspace) => !workspace.removedFromSidebar),
    [workspaceItems],
  );

  const { isDragging, draggedItemId, localOrder, handleDragStart, cursorPosition } =
    useWorkspaceDrag(visibleItems, onReorderWorkspaces);
  const { handleTogglePin } = useWorkspacePin(visibleItems, onPinWorkspace, onUnpinWorkspace);

  return (
    <section className="adl-leftbar__nav" aria-label={t.workspaces}>
      <div className="adl-workspace-toolbar">
        <div className="adl-section-toolbar__title">
          <span className="adl-section-toolbar__label">{t.projects}</span>
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

      <ul className="adl-workspace-list" role="list">
        {visibleItems.length === 0 ? <li className="adl-empty-hint">{t.workspaceEmpty}</li> : null}
        {(() => {
          const itemById = new Map(visibleItems.map((w) => [w.id, w] as const));
          const orderedItems = localOrder
            .map((id) => itemById.get(id))
            .filter((x): x is RecentWorkspaceEntry => x != null);
          return orderedItems.map((item) => {
            const isCurrent = isCurrentWorkspace(item, currentWorkspace);
            const isItemDragging = draggedItemId === item.id;

            return (
              <li
                key={item.id}
                className={`adl-workspace-item${isCurrent ? ' is-current' : ''}${isItemDragging ? ' adl-dragging' : ''}`}
                data-ws-id={item.id}
              >
                <div
                  className="adl-workspace-row"
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onContextMenu(item.id, event.clientX, event.clientY);
                  }}
                >
                  <span className="adl-workspace-row__leading">
                    <span className="adl-workspace-row__kind" aria-hidden="true">
                      <IconFolder size={12} decorative />
                    </span>
                  </span>

                  <span
                    className="adl-workspace-row__label"
                    title={item.path}
                    onMouseDown={(event) => handleDragStart(event, item.id, item.isPinned)}
                  >
                    <span>{item.name}</span>
                  </span>

                  <div className="adl-workspace-row__tail">
                    <span className="adl-workspace-row__secondary">
                      <TooltipSimple
                        content={item.isPinned ? t.sessionMenuUnpin : t.sessionMenuPin}
                        placement="right"
                      >
                        <button
                          type="button"
                          className="adl-workspace-row__pin"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleTogglePin(item.id);
                          }}
                          aria-label={item.isPinned ? t.sessionMenuUnpin : t.sessionMenuPin}
                        >
                          {item.isPinned ? (
                            <IconPinOff size={12} decorative />
                          ) : (
                            <IconPin size={12} decorative />
                          )}
                        </button>
                      </TooltipSimple>
                    </span>

                    <div className="adl-workspace-row__actions">
                      <TooltipSimple content={t.menuSettings} placement="right">
                        <button
                          type="button"
                          className="adl-icon-btn adl-icon-btn--xs"
                          onClick={(event) => {
                            event.stopPropagation();
                            const rect = event.currentTarget.getBoundingClientRect();
                            onContextMenu(item.id, rect.right, rect.bottom + 4);
                          }}
                          aria-label={t.menuSettings}
                        >
                          <IconMoreVertical size={12} decorative />
                        </button>
                      </TooltipSimple>
                    </div>
                  </div>
                </div>
              </li>
            );
          });
        })()}
      </ul>

      <DragOverlayPortal visible={isDragging} position={cursorPosition}>
        {draggedItemId ? (
          <span className="adl-sortable-label">
            {visibleItems.find((w) => w.id === draggedItemId)?.name ?? ''}
          </span>
        ) : null}
      </DragOverlayPortal>
    </section>
  );
}
