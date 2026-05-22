import React, { useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { AppInfo, ConversationSessionRecord, IndexingStatus, RecentWorkspaceEntry, ReorderSessionsInput, ReorderWorkspacesInput, TaskCenterSnapshot } from "@ai-digital-life/kernel";
import type { CopyDict, Locale } from "../copy";
import { IconArchive, IconPlug, IconSparkles } from "../icons";
import { buildSidebarViewModel } from "../sidebarViewModel";
import { useUiStore } from "../ui-store";
import { TooltipSimple } from "../components/Tooltip";
import { SidebarContextMenu, SidebarMenuState, buildWorkspaceMenuItems, buildSessionMenuItems, exportSessionMarkdown } from "./left-sidebar/SidebarContextMenu";
import { ResizeHandle } from "./left-sidebar/ResizeHandle";
import { ConversationPanel } from "./left-sidebar/ConversationPanel";
import { WorkspaceList } from "./left-sidebar/WorkspaceList";
import { SessionList } from "./left-sidebar/SessionList";
import type { SidebarSessionItem } from "../sidebarViewModel";

interface LeftSidebarProps {
  t: CopyDict;
  locale: Locale;
  appInfo?: AppInfo;
  collapsed: boolean;
  recentWorkspaces: RecentWorkspaceEntry[];
  sessions: ConversationSessionRecord[];
  activeSessionId?: string;
  streamingActiveRunId?: string;
  taskCenter?: TaskCenterSnapshot;
  indexingStatus?: IndexingStatus;
  onSelectSession: (id: string) => void;
  onCreateSession: () => void;
  onPinWorkspace: (workspaceId: string) => void;
  onUnpinWorkspace: (workspaceId: string) => void;
  onRemoveWorkspace: (workspaceId: string) => void;
  onReorderWorkspaces: (input: ReorderWorkspacesInput) => void;
  onPinSession: (sessionId: string) => void;
  onUnpinSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onArchiveSession: (sessionId: string) => void;
  onArchiveAllSessions: () => void;
  onMarkSessionRead: (sessionId: string) => void;
  onMarkSessionUnread: (sessionId: string) => void;
  onMarkAllSessionsRead: (sessionIds: string[]) => void;
  onReorderSessions: (input: ReorderSessionsInput) => void;
  onRevealWorkspace: (workspacePath: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onOpenWorkspace: (path: string) => void;
  onTriggerCreateWorkspace: () => void;
}

export function LeftSidebar({
  t,
  locale,
  appInfo,
  collapsed,
  recentWorkspaces,
  sessions,
  activeSessionId,
  streamingActiveRunId,
  taskCenter,
  onSelectSession,
  onCreateSession,
  onPinWorkspace,
  onUnpinWorkspace,
  onRemoveWorkspace,
  onReorderWorkspaces,
  onPinSession,
  onUnpinSession,
  onRenameSession,
  onArchiveSession,
  onArchiveAllSessions,
  onMarkSessionRead,
  onMarkSessionUnread,
  onMarkAllSessionsRead,
  onReorderSessions,
  onRevealWorkspace,
  onDeleteSession,
  onOpenWorkspace,
  onTriggerCreateWorkspace
}: LeftSidebarProps) {
  const { expandedSessionWorkspaces, toggleSessionWorkspace } = useUiStore(
    useShallow((state) => ({
      expandedSessionWorkspaces: state.expandedSessionWorkspaces,
      toggleSessionWorkspace: state.toggleSessionWorkspace
    }))
  );
  const [menuState, setMenuState] = useState<SidebarMenuState>();
  const [dragWorkspaceId, setDragWorkspaceId] = useState<string>();
  const [renamingSessionId, setRenamingSessionId] = useState<string>();
  const [renameDraft, setRenameDraft] = useState("");

  const leftbarContentRef = useRef<HTMLDivElement | null>(null);
  const workspaceToolbarRef = useRef<HTMLDivElement | null>(null);

  const sidebarViewModel = useMemo(
    () =>
      buildSidebarViewModel({
        appInfo,
        recentWorkspaces,
        sessions,
        streamingActiveRunId,
        taskCenter
      }),
    [appInfo, recentWorkspaces, sessions, streamingActiveRunId, taskCenter]
  );
  const workspaceItems = sidebarViewModel.workspaces;
  const displayStandaloneSessions = sidebarViewModel.standaloneSessions;
  const displayStandaloneArchivedSessions = sidebarViewModel.standaloneArchivedSessions;

  const sessionItemsById = useMemo(() => {
    const items = new Map<string, SidebarSessionItem>();
    for (const workspaceItem of workspaceItems) {
      for (const sessionItem of workspaceItem.sessions) {
        items.set(sessionItem.session.id, sessionItem);
      }
      for (const sessionItem of workspaceItem.archivedSessions) {
        items.set(sessionItem.session.id, sessionItem);
      }
    }
    for (const sessionItem of displayStandaloneSessions) {
      items.set(sessionItem.session.id, sessionItem);
    }
    for (const sessionItem of displayStandaloneArchivedSessions) {
      items.set(sessionItem.session.id, sessionItem);
    }
    return items;
  }, [displayStandaloneArchivedSessions, displayStandaloneSessions, workspaceItems]);

  const handleRenamingChange = (sessionId: string | undefined, draft?: string) => {
    setRenamingSessionId(sessionId);
    if (draft !== undefined) {
      setRenameDraft(draft);
    }
  };

  const commonSessionProps = {
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
    renamingSessionId,
    renameDraft,
    onRenamingChange: handleRenamingChange,
    locale,
    t
  };

  return (
    <aside
      className={`adl-leftbar${collapsed ? " adl-leftbar--collapsed" : ""}`}
      aria-label="Workspace and session navigator"
      aria-hidden={collapsed}
    >
      <div className="adl-leftbar__content" ref={leftbarContentRef}>
        <section className="adl-leftbar__quick">
          <TooltipSimple content={`${t.quickSkills} · ${t.quickSkillsComingSoon}`} placement="right">
            <button type="button" className="adl-quick-btn" disabled>
              <IconSparkles size={16} decorative />
              <span className="adl-quick-btn__label">{t.quickSkills}</span>
            </button>
          </TooltipSimple>
          <TooltipSimple content={`${t.quickMcp} · ${t.quickSkillsComingSoon}`} placement="right">
            <button type="button" className="adl-quick-btn" disabled>
              <IconPlug size={16} decorative />
              <span className="adl-quick-btn__label">{t.quickMcp}</span>
              <span className="adl-status-lamp adl-status-lamp--read" aria-hidden="true" />
            </button>
          </TooltipSimple>
        </section>

        <WorkspaceList
          t={t}
          workspaceItems={workspaceItems}
          expandedSessionWorkspaces={expandedSessionWorkspaces}
          toggleSessionWorkspace={toggleSessionWorkspace}
          dragWorkspaceId={dragWorkspaceId}
          setDragWorkspaceId={setDragWorkspaceId}
          onReorderWorkspaces={onReorderWorkspaces}
          onOpenWorkspace={onOpenWorkspace}
          onPinWorkspace={onPinWorkspace}
          onUnpinWorkspace={onUnpinWorkspace}
          onCreateSession={onCreateSession}
          onTriggerCreateWorkspace={onTriggerCreateWorkspace}
          onSelectSession={onSelectSession}
          onContextMenu={(workspaceId, x, y) => setMenuState({ type: "workspace", workspaceId, x, y })}
          renderSessionRows={(sessionItems, options) => (
            <SessionList
              sessionItems={sessionItems}
              listKey={options.listKey}
              workspaceId={options.workspaceId}
              interactive={options.interactive}
              allowStandaloneReorder={options.allowStandaloneReorder}
              {...commonSessionProps}
              onSessionContextMenu={(sessionId, x, y) => setMenuState({ type: "session", sessionId, x, y })}
            />
          )}
          workspaceToolbarRef={workspaceToolbarRef}
        />

        <ConversationPanel
          t={t}
          onCreateSession={onCreateSession}
          leftbarContentRef={leftbarContentRef}
          workspaceToolbarRef={workspaceToolbarRef}
        >
          <ul className="adl-session-list adl-session-list--standalone" role="list">
            {displayStandaloneSessions.length === 0 ? <li className="adl-empty-hint">{t.conversationEmpty}</li> : null}
            <SessionList
              sessionItems={displayStandaloneSessions}
              listKey="standalone"
              allowStandaloneReorder={false}
              {...commonSessionProps}
              onSessionContextMenu={(sessionId, x, y) => setMenuState({ type: "session", sessionId, x, y })}
            />
          </ul>
          {displayStandaloneArchivedSessions.length > 0 ? (
            <details className="adl-archive">
              <summary>
                <IconArchive size={12} decorative />
                <span>{t.sessionMenuArchive}</span>
                <span className="adl-badge">{displayStandaloneArchivedSessions.length}</span>
              </summary>
              <ul>
                <SessionList
                  sessionItems={displayStandaloneArchivedSessions}
                  listKey="standalone-archive"
                  interactive={false}
                  {...commonSessionProps}
                  onSessionContextMenu={(sessionId, x, y) => setMenuState({ type: "session", sessionId, x, y })}
                />
              </ul>
            </details>
          ) : null}
        </ConversationPanel>
      </div>

      {menuState ? (
        menuState.type === "workspace" ? (
          (() => {
            const workspace = workspaceItems.find((item) => item.workspace.id === menuState.workspaceId);
            const sessionIds = workspaceItems.find((item) => item.workspace.id === menuState.workspaceId)?.sessions.map((item) => item.session.id) ?? [];
            return workspace ? (
              <SidebarContextMenu
                items={buildWorkspaceMenuItems(workspace.workspace, sessionIds, t, {
                  onPinWorkspace,
                  onUnpinWorkspace,
                  onMarkAllSessionsRead,
                  onArchiveAllSessions,
                  onRemoveWorkspace,
                  onRevealWorkspace
                })}
                x={menuState.x}
                y={menuState.y}
                onClose={() => setMenuState(undefined)}
              />
            ) : null;
          })()
        ) : sessionItemsById.has(menuState.sessionId) ? (
          (() => {
            const sessionItem = sessionItemsById.get(menuState.sessionId)!;
            return (
              <SidebarContextMenu
                items={buildSessionMenuItems(sessionItem, t, {
                  onRename: () => {
                    setRenamingSessionId(sessionItem.session.id);
                    setRenameDraft(sessionItem.session.title);
                  },
                  onMarkRead: () => onMarkSessionRead(sessionItem.session.id),
                  onMarkUnread: () => onMarkSessionUnread(sessionItem.session.id),
                  onArchive: () => onArchiveSession(sessionItem.session.id),
                  onCopyId: () => void navigator.clipboard?.writeText(sessionItem.session.id),
                  onExport: () => void exportSessionMarkdown(sessionItem.session),
                  onPin: () => onPinSession(sessionItem.session.id),
                  onUnpin: () => onUnpinSession(sessionItem.session.id),
                  onDelete: () => onDeleteSession(sessionItem.session.id)
                })}
                x={menuState.x}
                y={menuState.y}
                onClose={() => setMenuState(undefined)}
              />
            );
          })()
        ) : null
      ) : null}

      <ResizeHandle />
    </aside>
  );
}
