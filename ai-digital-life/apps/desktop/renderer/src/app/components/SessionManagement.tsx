import React, { useState, useCallback, useMemo } from "react";
import { renderIcon, type IconName } from "../../design-system/icons";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SessionItem {
  id: string;
  title: string;
  updatedAt: string;
  status?: "active" | "pending" | "error" | "done";
}

export interface WorkspaceTab {
  id: string;
  name: string;
  isActive: boolean;
  status?: "active" | "pending" | "error" | "done";
  isPinned?: boolean;
}

export interface SessionManagementProps {
  sessions: SessionItem[];
  activeSessionId?: string;
  workspaces?: WorkspaceTab[];
  onCreateSession: () => void;
  onSelectSession: (id: string) => void;
  onSelectWorkspace: (id: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Status helpers                                                     */
/* ------------------------------------------------------------------ */

type ItemStatus = NonNullable<SessionItem["status"]>;

const STATUS_DOT_COLOR: Record<ItemStatus, string> = {
  active: "var(--success)",
  pending: "var(--warning)",
  error: "var(--danger)",
  done: "var(--text-disabled)",
};

/** Return the highest-priority status color for a workspace (error > active > pending > done). */
function resolveWorkspaceStatusColor(workspace: WorkspaceTab): string {
  if (!workspace.status) return "var(--text-disabled)";
  const priority: ItemStatus[] = ["error", "active", "pending", "done"];
  for (const s of priority) {
    if (workspace.status === s) return STATUS_DOT_COLOR[s];
  }
  return "var(--text-disabled)";
}

/** Format an ISO timestamp into a short relative/localized string. */
function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;

    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;

    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

interface WorkspaceItemProps {
  workspace: WorkspaceTab;
  onSelect: (id: string) => void;
}

function WorkspaceItem({ workspace, onSelect }: WorkspaceItemProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      className={`sidebar-workspace-tab${workspace.isActive ? " sidebar-workspace-tab--active" : ""}`}
      onClick={() => onSelect(workspace.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-current={workspace.isActive ? "true" : undefined}
    >
      <span
        className="sidebar-workspace-tab__icon"
        dangerouslySetInnerHTML={{ __html: renderIcon("folder", { size: "sm", decorative: true }).value }}
      />
      <span className="sidebar-workspace-tab__name" title={workspace.name}>
        {workspace.name}
      </span>
      <span
        className="sidebar-workspace-tab__dot"
        style={{ backgroundColor: resolveWorkspaceStatusColor(workspace) }}
        aria-hidden="true"
      />

      {/* Hover actions */}
      <span className={`sidebar-workspace-tab__actions${hovered ? " is-visible" : ""}`}>
        {workspace.isPinned ? (
          <span
            className="sidebar-workspace-tab__action"
            title="Pinned"
            dangerouslySetInnerHTML={{
              __html: renderIcon("pin", { size: "xs", decorative: true }).value,
            }}
          />
        ) : (
          <span
            className="sidebar-workspace-tab__action"
            title="Pin"
            dangerouslySetInnerHTML={{
              __html: renderIcon("pin", { size: "xs", decorative: true }).value,
            }}
          />
        )}
        <span
          className="sidebar-workspace-tab__action"
          title="More options"
          dangerouslySetInnerHTML={{
            __html: renderIcon("more-vertical", { size: "xs", decorative: true }).value,
          }}
        />
      </span>
    </button>
  );
}

interface SessionItemProps {
  session: SessionItem;
  isActive: boolean;
  onSelect: (id: string) => void;
}

function SessionItemEl({ session, isActive, onSelect }: SessionItemProps) {
  const statusColor = session.status ? STATUS_DOT_COLOR[session.status] : "var(--text-disabled)";

  return (
    <button
      type="button"
      className={`sidebar-session-item${isActive ? " sidebar-session-item--active" : ""}`}
      onClick={() => onSelect(session.id)}
      aria-current={isActive ? "true" : undefined}
    >
      <span
        className="sidebar-session-item__dot"
        style={{ backgroundColor: statusColor }}
        aria-hidden="true"
      />
      <span className="sidebar-session-item__content">
        <span className="sidebar-session-item__title" title={session.title}>
          {session.title}
        </span>
        <span className="sidebar-session-item__time">{formatTimestamp(session.updatedAt)}</span>
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
  onSelectSession,
  onSelectWorkspace,
}: SessionManagementProps): React.ReactElement {
  const [workspacesCollapsed, setWorkspacesCollapsed] = useState(false);
  const [sessionsCollapsed, setSessionsCollapsed] = useState(false);

  const handleToggleWorkspaces = useCallback(() => {
    setWorkspacesCollapsed((prev) => !prev);
  }, []);

  const handleToggleSessions = useCallback(() => {
    setSessionsCollapsed((prev) => !prev);
  }, []);

  /** Determine the active workspace ID for indenting sessions. */
  const activeWorkspaceId = useMemo(
    () => workspaces.find((w) => w.isActive)?.id,
    [workspaces]
  );

  return (
    <div className="sidebar-session-mgmt" role="region" aria-label="Session management">
      {/* ---- Workspaces section ---- */}
      <div className="sidebar-section">
        <header className="sidebar-section__header">
          <button
            type="button"
            className="sidebar-section__toggle"
            onClick={handleToggleWorkspaces}
            aria-expanded={!workspacesCollapsed}
            aria-label="Toggle workspaces"
          >
            <span
              className={`sidebar-section__chevron${workspacesCollapsed ? " is-collapsed" : ""}`}
              dangerouslySetInnerHTML={{
                __html: renderIcon("chevron-right", { size: "xs", decorative: true }).value,
              }}
            />
            <span className="sidebar-section__title">Workspaces</span>
          </button>
          <button
            type="button"
            className="sidebar-section__add-btn"
            onClick={() => {} /* TODO: wire to onNewWorkspace via parent */ }
            title="New workspace"
            aria-label="Add workspace"
          >
            <span
              dangerouslySetInnerHTML={{
                __html: renderIcon("plus", { size: "xs", decorative: true }).value,
              }}
            />
          </button>
        </header>

        {!workspacesCollapsed && (
          <ul className="sidebar-section__list" role="listbox" aria-label="Workspaces">
            {workspaces.map((ws) => (
              <li key={ws.id}>
                <WorkspaceItem workspace={ws} onSelect={onSelectWorkspace} />
              </li>
            ))}
            {workspaces.length === 0 && (
              <li className="sidebar-section__empty">No workspaces yet</li>
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
            aria-label="Toggle sessions"
          >
            <span
              className={`sidebar-section__chevron${sessionsCollapsed ? " is-collapsed" : ""}`}
              dangerouslySetInnerHTML={{
                __html: renderIcon("chevron-right", { size: "xs", decorative: true }).value,
              }}
            />
            <span className="sidebar-section__title">Sessions</span>
          </button>
          <button
            type="button"
            className="sidebar-section__add-btn"
            onClick={onCreateSession}
            title="New session"
            aria-label="Create session"
          >
            <span
              dangerouslySetInnerHTML={{
                __html: renderIcon("plus", { size: "xs", decorative: true }).value,
              }}
            />
          </button>
        </header>

        {!sessionsCollapsed && (
          <ul
            className="sidebar-section__list sidebar-session-list"
            role="listbox"
            aria-label="Sessions"
            style={activeWorkspaceId ? { paddingLeft: "16px" } : undefined}
          >
            {sessions.map((session) => (
              <li key={session.id}>
                <SessionItemEl
                  session={session}
                  isActive={session.id === activeSessionId}
                  onSelect={onSelectSession}
                />
              </li>
            ))}
            {sessions.length === 0 && (
              <li className="sidebar-section__empty">No sessions yet</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

export default SessionManagement;
