import React from 'react';
import { IconArchive, IconMoreVertical, IconPin, IconPinOff } from '../../icons';
import { TooltipSimple } from '../../components/Tooltip';
import type { SidebarSessionItem } from '../../utils/sidebarViewModel';
import { STATUS_LABEL } from './SidebarContextMenu.utils';
import { StatusLamp } from './SidebarContextMenu';
import { useTCopy } from '../../i18n/useTCopy';
import { resolveDemoEntityText } from '../../i18n/resolveDemoEntityText';

interface SessionListRowProps {
  sessionItem: SidebarSessionItem;
  activeSessionId?: string;
  droppedSessionId?: string;
  isDropTarget: boolean;
  isHighlighted: boolean;
  isHovered: boolean;
  canReorder: boolean;
  canReorderIntoTarget: boolean;
  draggedSessionItem: SidebarSessionItem | undefined;
  workspaceId?: string;
  interactive?: boolean;
  locale: string;
  onSelectSession: (id: string) => void;
  onPinSession: (sessionId: string) => void;
  onUnpinSession: (sessionId: string) => void;
  onArchiveSession: (sessionId: string) => void;
  onSessionContextMenu?: (sessionId: string, x: number, y: number) => void;
  handleStartRename: (sessionId: string, sessionName: string) => void;
  handleSessionDrop: (targetSessionId: string, isPinnedBucket: boolean) => void;
  setHoveredSessionId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setDragSessionId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setDragOverSessionTarget: (nextSessionId: string | undefined) => void;
}

const SessionListRow = React.memo(function SessionListRow({
  sessionItem,
  activeSessionId,
  droppedSessionId,
  isDropTarget,
  isHighlighted,
  isHovered,
  canReorder,
  canReorderIntoTarget,
  draggedSessionItem,
  workspaceId,
  interactive = true,
  locale,
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
}: SessionListRowProps) {
  const { t } = useTCopy();
  return (
    <li
      key={sessionItem.session.id}
      className={`adl-session-row${draggedSessionItem?.session.id === sessionItem.session.id ? ' is-dragging' : ''}${isDropTarget ? ' is-drop-target' : ''}${canReorderIntoTarget ? ' is-reorderable-target' : ''}`}
      draggable={canReorder}
      onDragStart={(event) => {
        if (interactive) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', sessionItem.session.id);
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
        className={`adl-session-item${sessionItem.session.id === activeSessionId ? ' is-active' : ''}${draggedSessionItem?.session.id === sessionItem.session.id ? ' is-dragging' : ''}${isDropTarget ? ' is-drop-target' : ''}${droppedSessionId === sessionItem.session.id ? ' is-drop-flash' : ''}${isHighlighted ? ' is-highlighted' : ''}`}
        onMouseEnter={() => setHoveredSessionId(sessionItem.session.id)}
        onMouseLeave={() =>
          setHoveredSessionId((current) =>
            current === sessionItem.session.id ? undefined : current,
          )
        }
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
          if (event.key === 'Enter' || event.key === ' ') {
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
              if (sessionItem.session.isPinned) {
                onUnpinSession(sessionItem.session.id);
              } else {
                onPinSession(sessionItem.session.id);
              }
            }}
          >
            {sessionItem.session.isPinned ? (
              <IconPinOff size={12} decorative />
            ) : (
              <IconPin size={12} decorative />
            )}
          </button>
        ) : (
          <span
            className="adl-session-item__indicator adl-session-item__indicator--static"
            aria-hidden="true"
          >
            <StatusLamp
              status={sessionItem.status}
              title={t[STATUS_LABEL[sessionItem.status]] as string}
            />
          </span>
        )}

        <TooltipSimple
          content={resolveDemoEntityText(sessionItem.session.title, t)}
          placement="right"
        >
          <span className="adl-session-item__title">
            <span className="adl-session-item__title-text">
              {resolveDemoEntityText(sessionItem.session.title, t)}
            </span>
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
              hour: '2-digit',
              minute: '2-digit',
              month: '2-digit',
              day: '2-digit',
            })}
          </span>
        )}
      </div>
    </li>
  );
});

export default SessionListRow;
