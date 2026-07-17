import React, { useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Locale } from '../i18n';
import { useTCopy } from '../i18n/useTCopy';
import { IconArchive, IconPlug, IconSparkles } from '../icons';
import { buildSidebarViewModel } from '../utils/sidebarViewModel';
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
import { asWorkspaceID, asSessionID } from '../../shared/branded';

interface LeftSidebarProps {
  collapsed: boolean;
  onCreateSession: () => void;
  onTriggerCreateWorkspace: () => void;
}

const LeftSidebar = React.memo(function LeftSidebar({
  collapsed,
  onCreateSession,
  onTriggerCreateWorkspace,
}: LeftSidebarProps) {
  const { t, formatT } = useTCopy();
  const actions = useAppActions();
  const {
    appInfo,
    recentWorkspaces,
    sessions,
    activeSessionId,
    streamingActiveRunId,
    taskCenter,
    expandedSessionWorkspaces,
    toggleSessionWorkspace,
  } = useAppStore(
    useShallow((s) => ({
      appInfo: s.appInfo,
      recentWorkspaces: s.recentWorkspaces,
      sessions: s.sessions,
      activeSessionId: s.activeSessionId,
      streamingActiveRunId: s.streamingActiveRunId,
      taskCenter: s.taskCenter,
      expandedSessionWorkspaces: s.expandedSessionWorkspaces,
      toggleSessionWorkspace: s.toggleSessionWorkspace,
    }))
  );
  const locale = (appInfo?.config.language ?? 'zh-CN') as Locale;
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

  const commonSessionProps = useMemo(
    () => ({
      onSelectSession: (id: string) => actions.selectSession(asSessionID(id)),
      onPinSession: (id: string) => actions.pinSession(asSessionID(id)),
      onUnpinSession: (id: string) => actions.unpinSession(asSessionID(id)),
      onRenameSession: (id: string, title: string) => actions.renameSession(asSessionID(id), title),
      onArchiveSession: (id: string) => actions.archiveSession(asSessionID(id)),
      onMarkSessionRead: (id: string) => actions.markSessionRead(asSessionID(id)),
      onMarkSessionUnread: (id: string) => actions.markSessionUnread(asSessionID(id)),
      onDeleteSession: (id: string) => actions.deleteSession(asSessionID(id)),
      onReorderSessions: actions.reorderSessions,
      activeSessionId,
      locale,
    }),
    [actions, activeSessionId, locale]
  );

  return (
    <aside
      className={`adl-leftbar${collapsed ? ' adl-leftbar--collapsed' : ''}`}
      aria-label={t.sidebarNavigator}
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
          workspaceItems={workspaceItems}
          expandedSessionWorkspaces={expandedSessionWorkspaces}
          toggleSessionWorkspace={toggleSessionWorkspace}
          dragWorkspaceId={dragWorkspaceId}
          setDragWorkspaceId={setDragWorkspaceId}
          onReorderWorkspaces={actions.reorderWorkspaces}
          onOpenWorkspace={actions.openWorkspace}
          onSwitchToWorkspace={(id: string, path: string) =>
            actions.switchToWorkspace(asWorkspaceID(id), path)
          }
          onPinWorkspace={(id: string) => actions.pinWorkspace(asWorkspaceID(id))}
          onUnpinWorkspace={(id: string) => actions.unpinWorkspace(asWorkspaceID(id))}
          onCreateSession={onCreateSession}
          onTriggerCreateWorkspace={onTriggerCreateWorkspace}
          onSelectSession={(id: string) => actions.selectSession(asSessionID(id))}
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
                    onPinWorkspace: (id: string) => actions.pinWorkspace(asWorkspaceID(id)),
                    onUnpinWorkspace: (id: string) => actions.unpinWorkspace(asWorkspaceID(id)),
                    onMarkAllSessionsRead: (ids: string[]) =>
                      actions.markAllSessionsRead(ids.map(asSessionID)),
                    onArchiveAllSessions: actions.archiveAllSessions,
                    onRemoveWorkspace: (id: string) =>
                      actions.removeWorkspaceFromSidebar(asWorkspaceID(id)),
                    onRevealWorkspace: actions.revealWorkspaceInFileManager,
                    onShowInRightPanels: (id: string) =>
                      actions.showWorkspaceInRightPanels(asWorkspaceID(id)),
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
                      onMarkRead: () =>
                        actions.markSessionRead(asSessionID(sessionItem.session.id)),
                      onMarkUnread: () =>
                        actions.markSessionUnread(asSessionID(sessionItem.session.id)),
                      onArchive: () => actions.archiveSession(asSessionID(sessionItem.session.id)),
                      onCopyId: () => void navigator.clipboard?.writeText(sessionItem.session.id),
                      onExport: () => void exportSessionMarkdown(sessionItem.session),
                      onPin: () => actions.pinSession(asSessionID(sessionItem.session.id)),
                      onUnpin: () => actions.unpinSession(asSessionID(sessionItem.session.id)),
                      onDelete: () => actions.deleteSession(asSessionID(sessionItem.session.id)),
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
          title={t.changesRenameSession}
          itemInfo={formatT(t, 'changesCurrentName', { name: sessionToRename.name })}
          placeholder={t.changesEnterSessionName}
          onConfirm={(newName) => {
            actions.renameSession(asSessionID(sessionToRename.id), newName);
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
