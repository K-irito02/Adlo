import React, { useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { CopyDict, Locale } from '../i18n';
import { IconArchive, IconPlug, IconSparkles } from '../icons';
import { buildSidebarViewModel } from '../utils/sidebarViewModel';
import { useUiStore } from '../stores/ui-store';
import { useAppStore } from '../stores/slicedStore';
import { useAppActions } from '../hooks/useAppActions';
import { TooltipSimple } from '../components/Tooltip';
import { RenameDialog } from '../components/RenameDialog';
import { SidebarContextMenu } from './left-sidebar/SidebarContextMenu';
import type { SidebarMenuState } from './left-sidebar/SidebarContextMenu.utils';
import {
  buildWorkspaceMenuItems,
  buildSessionMenuItems,
  exportSessionMarkdown,
} from './left-sidebar/SidebarContextMenu.utils';
import { ResizeHandle } from './left-sidebar/ResizeHandle';
import { ConversationPanel } from './left-sidebar/ConversationPanel';
import { WorkspaceList } from './left-sidebar/WorkspaceList';
import { SessionList } from './left-sidebar/SessionList';
import type { SidebarSessionItem } from '../utils/sidebarViewModel';

interface LeftSidebarProps {
  t: CopyDict;
  collapsed: boolean;
  onCreateSession: () => void;
  onTriggerCreateWorkspace: () => void;
}

const LeftSidebar = React.memo(function LeftSidebar({
  t,
  collapsed,
  onCreateSession,
  onTriggerCreateWorkspace,
}: LeftSidebarProps) {
  const actions = useAppActions();
  const { appInfo, recentWorkspaces, sessions, activeSessionId, streamingActiveRunId, taskCenter } = useAppStore(
    useShallow((s) => ({
      appInfo: s.appInfo,
      recentWorkspaces: s.recentWorkspaces,
      sessions: s.sessions,
      activeSessionId: s.activeSessionId,
      streamingActiveRunId: s.streamingActiveRunId,
      taskCenter: s.taskCenter,
    }))
  );
  const locale = (appInfo?.config.language ?? 'zh-CN') as Locale;
  const { expandedSessionWorkspaces, toggleSessionWorkspace } = useUiStore(
    useShallow((state) => ({
      expandedSessionWorkspaces: state.expandedSessionWorkspaces,
      toggleSessionWorkspace: state.toggleSessionWorkspace,
    }))
  );
  const [menuState, setMenuState] = useState<SidebarMenuState>();
  const [dragWorkspaceId, setDragWorkspaceId] = useState<string>();
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [sessionToRename, setSessionToRename] = useState<{ id: string; name: string } | null>(null);

  const leftbarContentRef = useRef<HTMLDivElement | null>(null);
  const workspaceToolbarRef = useRef<HTMLDivElement | null>(null);

  const sidebarViewModel = useMemo(
    () =>
      buildSidebarViewModel({
        appInfo,
        recentWorkspaces,
        sessions,
        streamingActiveRunId,
        taskCenter,
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

  const commonSessionProps = useMemo(() => ({
    onSelectSession: actions.selectSession,
    onPinSession: actions.pinSession,
    onUnpinSession: actions.unpinSession,
    onRenameSession: actions.renameSession,
    onArchiveSession: actions.archiveSession,
    onMarkSessionRead: actions.markSessionRead,
    onMarkSessionUnread: actions.markSessionUnread,
    onDeleteSession: actions.deleteSession,
    onReorderSessions: actions.reorderSessions,
    activeSessionId,
    locale,
    t,
  }), [actions, activeSessionId, locale, t]);

  return (
    <aside
      className={`adl-leftbar${collapsed ? ' adl-leftbar--collapsed' : ''}`}
      aria-label="Workspace and session navigator"
      aria-hidden={collapsed}
    >
      <div className="adl-leftbar__content" ref={leftbarContentRef}>
        <section className="adl-leftbar__quick">
          <TooltipSimple
            content={`${t.quickSkills} · ${t.quickSkillsComingSoon}`}
            placement="right"
          >
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
          onReorderWorkspaces={actions.reorderWorkspaces}
          onOpenWorkspace={actions.openWorkspace}
          onSwitchToWorkspace={actions.switchToWorkspace}
          onPinWorkspace={actions.pinWorkspace}
          onUnpinWorkspace={actions.unpinWorkspace}
          onCreateSession={onCreateSession}
          onTriggerCreateWorkspace={onTriggerCreateWorkspace}
          onSelectSession={actions.selectSession}
          onContextMenu={(workspaceId, x, y) =>
            setMenuState({ type: 'workspace', workspaceId, x, y })
          }
          renderSessionRows={(sessionItems, options) => (
            <SessionList
              sessionItems={sessionItems}
              listKey={options.listKey}
              workspaceId={options.workspaceId}
              interactive={options.interactive}
              allowStandaloneReorder={options.allowStandaloneReorder}
              {...commonSessionProps}
              onSessionContextMenu={(sessionId, x, y) =>
                setMenuState({ type: 'session', sessionId, x, y })
              }
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
            {displayStandaloneSessions.length === 0 ? (
              <li className="adl-empty-hint">{t.conversationEmpty}</li>
            ) : null}
            <SessionList
              sessionItems={displayStandaloneSessions}
              listKey="standalone"
              allowStandaloneReorder={false}
              {...commonSessionProps}
              onSessionContextMenu={(sessionId, x, y) =>
                setMenuState({ type: 'session', sessionId, x, y })
              }
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
                  onSessionContextMenu={(sessionId, x, y) =>
                    setMenuState({ type: 'session', sessionId, x, y })
                  }
                />
              </ul>
            </details>
          ) : null}
        </ConversationPanel>
      </div>

      {menuState
        ? menuState.type === 'workspace'
          ? (() => {
              const workspace = workspaceItems.find(
                (item) => item.workspace.id === menuState.workspaceId
              );
              const sessionIds =
                workspaceItems
                  .find((item) => item.workspace.id === menuState.workspaceId)
                  ?.sessions.map((item) => item.session.id) ?? [];
              return workspace ? (
                <SidebarContextMenu
                  items={buildWorkspaceMenuItems(workspace.workspace, sessionIds, t, {
                    onPinWorkspace: actions.pinWorkspace,
                    onUnpinWorkspace: actions.unpinWorkspace,
                    onMarkAllSessionsRead: actions.markAllSessionsRead,
                    onArchiveAllSessions: actions.archiveAllSessions,
                    onRemoveWorkspace: actions.removeWorkspaceFromSidebar,
                    onRevealWorkspace: actions.revealWorkspaceInFileManager,
                    onShowInRightPanels: actions.showWorkspaceInRightPanels,
                  })}
                  x={menuState.x}
                  y={menuState.y}
                  onClose={() => setMenuState(undefined)}
                />
              ) : null;
            })()
          : sessionItemsById.has(menuState.sessionId)
            ? (() => {
                const sessionItem = sessionItemsById.get(menuState.sessionId)!;
                return (
                  <SidebarContextMenu
                    items={buildSessionMenuItems(sessionItem, t, {
                      onRename: () => {
                        setSessionToRename({
                          id: sessionItem.session.id,
                          name: sessionItem.session.title,
                        });
                        setRenameDialogOpen(true);
                      },
                      onMarkRead: () => actions.markSessionRead(sessionItem.session.id),
                      onMarkUnread: () => actions.markSessionUnread(sessionItem.session.id),
                      onArchive: () => actions.archiveSession(sessionItem.session.id),
                      onCopyId: () => void navigator.clipboard?.writeText(sessionItem.session.id),
                      onExport: () => void exportSessionMarkdown(sessionItem.session),
                      onPin: () => actions.pinSession(sessionItem.session.id),
                      onUnpin: () => actions.unpinSession(sessionItem.session.id),
                      onDelete: () => actions.deleteSession(sessionItem.session.id),
                    })}
                    x={menuState.x}
                    y={menuState.y}
                    onClose={() => setMenuState(undefined)}
                  />
                );
              })()
            : null
        : null}

      {sessionToRename && (
        <RenameDialog
          open={renameDialogOpen}
          initialValue={sessionToRename.name}
          title="重命名会话"
          itemInfo={`当前名称: ${sessionToRename.name}`}
          placeholder="输入新会话名称"
          onConfirm={(newName) => {
            actions.renameSession(sessionToRename.id, newName);
            setRenameDialogOpen(false);
            setSessionToRename(null);
          }}
          onCancel={() => {
            setRenameDialogOpen(false);
            setSessionToRename(null);
          }}
        />
      )}

      <ResizeHandle />
    </aside>
  );
});

export { LeftSidebar };
