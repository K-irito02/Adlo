import React, { useState, useCallback, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { renderIcon } from '../../design-system/icons';
import { TooltipSimple } from './Tooltip';
import { useTCopy } from '../i18n/useTCopy';
import { resolveDemoEntityText } from '../i18n/resolveDemoEntityText';
import type { CopyDict, CopyKey } from '../i18n';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SessionItem {
  id: string;
  title: string;
  updatedAt: string;
  status?: 'active' | 'pending' | 'error' | 'done';
}

export interface WorkspaceTab {
  id: string;
  name: string;
  isActive: boolean;
  status?: 'active' | 'pending' | 'error' | 'done';
  isPinned?: boolean;
}

export interface SessionManagementProps {
  sessions: SessionItem[];
  activeSessionId?: string;
  workspaces?: WorkspaceTab[];
  onCreateSession: () => void;
  onNewWorkspace: () => void;
  onSelectSession: (id: string) => void;
  onSelectWorkspace: (id: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Status helpers                                                     */
/* ------------------------------------------------------------------ */

type ItemStatus = NonNullable<SessionItem['status']>;

const STATUS_DOT_COLOR: Record<ItemStatus, string> = {
  active: 'var(--success)',
  pending: 'var(--warning)',
  error: 'var(--danger)',
  done: 'var(--text-disabled)',
};

/** Return the highest-priority status color for a workspace (error > active > pending > done). */
function resolveWorkspaceStatusColor(workspace: WorkspaceTab): string {
  if (!workspace.status) {
    return 'var(--text-disabled)';
  }
  const priority: ItemStatus[] = ['error', 'active', 'pending', 'done'];
  for (const s of priority) {
    if (workspace.status === s) {
      return STATUS_DOT_COLOR[s];
    }
  }
  return 'var(--text-disabled)';
}

/** Format an ISO timestamp into a short relative/localized string. */
function formatTimestamp(
  iso: string,
  t: CopyDict,
  formatFn: (t: CopyDict, key: CopyKey, vars?: Record<string, string | number>) => string,
): string {
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) {
      return formatFn(t, 'relativeTimeJustNow');
    }
    if (diffMin < 60) {
      return formatFn(t, 'relativeTimeMinutesAgo', { n: diffMin });
    }

    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) {
      return formatFn(t, 'relativeTimeHoursAgo', { n: diffHr });
    }

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

interface WorkspaceItemProps {
  workspace: WorkspaceTab;
  onSelect: (id: string) => void;
  t: CopyDict;
}

function WorkspaceItem({ workspace, onSelect, t }: WorkspaceItemProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      className={`sidebar-workspace-tab${workspace.isActive ? ' sidebar-workspace-tab--active' : ''}`}
      onClick={() => onSelect(workspace.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-current={workspace.isActive ? 'true' : undefined}
    >
      <span
        className="sidebar-workspace-tab__icon"
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(
            renderIcon('folder', { size: 'sm', decorative: true }).value || '',
          ),
        }}
      />
      <span className="sidebar-workspace-tab__name">
        <TooltipSimple content={resolveDemoEntityText(workspace.name, t)} placement="right">
          <span>{resolveDemoEntityText(workspace.name, t)}</span>
        </TooltipSimple>
      </span>
      <span
        className="sidebar-workspace-tab__dot"
        style={{ backgroundColor: resolveWorkspaceStatusColor(workspace) }}
        aria-hidden="true"
      />

      {/* Hover actions */}
      <span className={`sidebar-workspace-tab__actions${hovered ? ' is-visible' : ''}`}>
        {workspace.isPinned ? (
          <TooltipSimple content={t.sessionMenuPin} placement="top">
            <span
              className="sidebar-workspace-tab__action"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(
                  renderIcon('pin', { size: 'xs', decorative: true }).value || '',
                ),
              }}
            />
          </TooltipSimple>
        ) : (
          <TooltipSimple content={t.pin} placement="top">
            <span
              className="sidebar-workspace-tab__action"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(
                  renderIcon('pin', { size: 'xs', decorative: true }).value || '',
                ),
              }}
            />
          </TooltipSimple>
        )}
        <TooltipSimple content={t.moreActions} placement="top">
          <span
            className="sidebar-workspace-tab__action"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(
                renderIcon('more-vertical', { size: 'xs', decorative: true }).value || '',
              ),
            }}
          />
        </TooltipSimple>
      </span>
    </button>
  );
}

interface SessionItemProps {
  session: SessionItem;
  isActive: boolean;
  onSelect: (id: string) => void;
  t: CopyDict;
  formatT: (t: CopyDict, key: CopyKey, vars?: Record<string, string | number>) => string;
}

function SessionItemEl({ session, isActive, onSelect, t, formatT }: SessionItemProps) {
  const statusColor = session.status ? STATUS_DOT_COLOR[session.status] : 'var(--text-disabled)';

  return (
    <button
      type="button"
      className={`sidebar-session-item${isActive ? ' sidebar-session-item--active' : ''}`}
      onClick={() => onSelect(session.id)}
      aria-current={isActive ? 'true' : undefined}
    >
      <span
        className="sidebar-session-item__dot"
        style={{ backgroundColor: statusColor }}
        aria-hidden="true"
      />
      <span className="sidebar-session-item__content">
        <span className="sidebar-session-item__title">
          <TooltipSimple content={resolveDemoEntityText(session.title, t)} placement="right">
            <span>{resolveDemoEntityText(session.title, t)}</span>
          </TooltipSimple>
        </span>
        <span className="sidebar-session-item__time">
          {formatTimestamp(session.updatedAt, t, formatT)}
        </span>
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

/**
 * Region 6 - Session management area (scrollable middle section of the left sidebar).
 *
 * Contains two sub-sections:
 *   a) Workspace Tabs header with collapsible list of workspaces
 *   b) Conversation Sessions list under the active workspace
 *
 * This region takes `flex: 1` and scrolls independently.
 */
export function SessionManagement({
  sessions = [],
  activeSessionId,
  workspaces = [],
  onCreateSession,
  onNewWorkspace,
  onSelectSession,
  onSelectWorkspace,
}: SessionManagementProps): React.ReactElement {
  const { t, formatT } = useTCopy();
  const [workspacesCollapsed, setWorkspacesCollapsed] = useState(false);
  const [sessionsCollapsed, setSessionsCollapsed] = useState(false);

  const handleToggleWorkspaces = useCallback(() => {
    setWorkspacesCollapsed((prev) => !prev);
  }, []);

  const handleToggleSessions = useCallback(() => {
    setSessionsCollapsed((prev) => !prev);
  }, []);

  /** Determine the active workspace ID for indenting sessions. */
  const activeWorkspaceId = useMemo(() => workspaces.find((w) => w.isActive)?.id, [workspaces]);

  return (
    <div className="sidebar-session-mgmt" role="region" aria-label={t.sessionManagement}>
      {/* ---- Workspaces section ---- */}
      <div className="sidebar-section">
        <header className="sidebar-section__header">
          <button
            type="button"
            className="sidebar-section__toggle"
            onClick={handleToggleWorkspaces}
            aria-expanded={!workspacesCollapsed}
            aria-label={t.toggleWorkspaces}
          >
            <span
              className={`sidebar-section__chevron${workspacesCollapsed ? ' is-collapsed' : ''}`}
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(
                  renderIcon('chevron-right', { size: 'xs', decorative: true }).value || '',
                ),
              }}
            />
            <span className="sidebar-section__title">{t.workspaces}</span>
          </button>
          <TooltipSimple content={t.quickNewWorkspace} placement="right">
            <button
              type="button"
              className="sidebar-section__add-btn"
              onClick={onNewWorkspace}
              aria-label={t.addWorkspace}
            >
              <span
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(
                    renderIcon('plus', { size: 'xs', decorative: true }).value || '',
                  ),
                }}
              />
            </button>
          </TooltipSimple>
        </header>

        {!workspacesCollapsed && (
          <ul className="sidebar-section__list" role="listbox" aria-label={t.workspaces}>
            {workspaces.map((ws) => (
              <li key={ws.id}>
                <WorkspaceItem workspace={ws} onSelect={onSelectWorkspace} t={t} />
              </li>
            ))}
            {workspaces.length === 0 && (
              <li className="sidebar-section__empty">{t.workspaceEmptyList}</li>
            )}
          </ul>
        )}
      </div>

      {/* ---- Sessions section ---- */}
      <div className="sidebar-section">
        <header className="sidebar-section__header">
          <button
            type="button"
            className="sidebar-section__toggle"
            onClick={handleToggleSessions}
            aria-expanded={!sessionsCollapsed}
            aria-label={t.toggleSessions}
          >
            <span
              className={`sidebar-section__chevron${sessionsCollapsed ? ' is-collapsed' : ''}`}
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(
                  renderIcon('chevron-right', { size: 'xs', decorative: true }).value || '',
                ),
              }}
            />
            <span className="sidebar-section__title">{t.sessions}</span>
          </button>
          <TooltipSimple content={t.newSession} placement="right">
            <button
              type="button"
              className="sidebar-section__add-btn"
              onClick={onCreateSession}
              aria-label={t.createSession}
            >
              <span
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(
                    renderIcon('plus', { size: 'xs', decorative: true }).value || '',
                  ),
                }}
              />
            </button>
          </TooltipSimple>
        </header>

        {!sessionsCollapsed && (
          <ul
            className="sidebar-section__list sidebar-session-list"
            role="listbox"
            aria-label={t.sessions}
            style={activeWorkspaceId ? { paddingLeft: '16px' } : undefined}
          >
            {sessions.map((session) => (
              <li key={session.id}>
                <SessionItemEl
                  session={session}
                  isActive={session.id === activeSessionId}
                  onSelect={onSelectSession}
                  t={t}
                  formatT={formatT}
                />
              </li>
            ))}
            {sessions.length === 0 && (
              <li className="sidebar-section__empty">{t.sessionEmptyList}</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

export default SessionManagement;
