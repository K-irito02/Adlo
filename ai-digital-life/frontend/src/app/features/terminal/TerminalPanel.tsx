import React, { useCallback, useMemo } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import {
  IconFiles,
  IconFileCode,
  IconFoldVertical,
  IconPanelLeftClose,
  IconRefreshCw,
  IconTrash,
  IconUnfoldVertical,
} from '../../icons';
import { TooltipSimple } from '../../components/Tooltip';
import { XtermTerminal } from '../../components/terminal/XtermTerminal';
import type { TerminalPanelProps } from '../../regions/right-panel/types';
import type { TerminalProfile } from '../../stores/types';
import { useTerminalPanel } from './useTerminalPanel';
import { TerminalShellSelector } from './TerminalShellSelector';
import { TerminalMenuDropdown } from './TerminalMenuDropdown';
import { TerminalContextMenu } from './TerminalContextMenu';
import { MultiWorkspaceTerminal } from '../workspace-terminal';

export function TerminalPanel(props: TerminalPanelProps) {
  const { t, latestCommandRun } = props;

  const setActiveRightTool = useAppStore((state) => state.setActiveRightTool);
  const recentWorkspaces = useAppStore((s) => s.recentWorkspaces);
  const terminalWorkspaceExpanded = useAppStore((s) => s.terminalWorkspaceExpanded);
  const setTerminalWorkspaceExpanded = useAppStore((s) => s.setTerminalWorkspaceExpanded);
  const terminalSelectTab = useAppStore((s) => s.terminalSelectTab);
  const terminalCloseTab = useAppStore((s) => s.terminalCloseTab);
  const terminalTogglePin = useAppStore((s) => s.terminalTogglePin);
  const hideWorkspaceFromRightPanels = useAppStore((s) => s.hideWorkspaceFromRightPanels);

  const { terminalState, terminalActions } = useTerminalPanel(props);
  const {
    activeTab,
    hasActiveTab,
    navigatorMode,
    navigatorCollapsed,
    terminalNavigatorWidth,
    terminalTabs,
    currentProfile,
    currentProfileLabel,
    shellMenuOpen,
    shellMenuItems,
    shellMenuRef,
    terminalMenuOpen,
    terminalMenuRef,
    terminalMenuItems,
    terminalActiveTabId,
    xtermRef,
    contextMenu,
  } = terminalState;

  const INDEPENDENT_WORKSPACE_ID = '__independent__';

  const visibleWorkspaces = useMemo(
    () =>
      recentWorkspaces.filter(
        (w) => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available
      ),
    [recentWorkspaces]
  );

  const allTerminalExpanded = useMemo(() => {
    const independentExpanded = terminalWorkspaceExpanded[INDEPENDENT_WORKSPACE_ID] !== false;
    const allWorkspaceExpanded =
      visibleWorkspaces.length > 0 &&
      visibleWorkspaces.every((w) => terminalWorkspaceExpanded[w.id]);
    return visibleWorkspaces.length === 0
      ? independentExpanded
      : independentExpanded && allWorkspaceExpanded;
  }, [visibleWorkspaces, terminalWorkspaceExpanded]);

  const terminalNavigatorTitle = navigatorMode === 'history' ? '命令历史' : '终端';

  const handleExpandAllTerminal = useCallback(() => {
    const expanded: Record<string, boolean> = {};
    expanded[INDEPENDENT_WORKSPACE_ID] = true;
    for (const ws of visibleWorkspaces) {
      expanded[ws.id] = true;
    }
    setTerminalWorkspaceExpanded(expanded);
  }, [visibleWorkspaces, setTerminalWorkspaceExpanded]);

  const handleCollapseAllTerminal = useCallback(() => {
    const expanded: Record<string, boolean> = {};
    expanded[INDEPENDENT_WORKSPACE_ID] = false;
    setTerminalWorkspaceExpanded(expanded);
  }, [setTerminalWorkspaceExpanded]);

  const visibleTabCount = useMemo(() => {
    let count = 0;
    count += terminalTabs.filter(
      (t) => !t.workspaceId || t.workspaceId === INDEPENDENT_WORKSPACE_ID
    ).length;
    for (const ws of visibleWorkspaces) {
      count += terminalTabs.filter((t) => t.workspaceId === ws.id).length;
    }
    return count;
  }, [visibleWorkspaces, terminalTabs]);

  const handleRefreshAllTerminal = useCallback(() => {
    const newExpanded: Record<string, boolean> = {};
    for (const ws of visibleWorkspaces) {
      newExpanded[ws.id] = true;
    }
    setTerminalWorkspaceExpanded(newExpanded);
  }, [visibleWorkspaces, setTerminalWorkspaceExpanded]);

  const toggleTerminalWorkspaceExpanded = useCallback(
    (workspaceId: string) => {
      setTerminalWorkspaceExpanded({
        ...terminalWorkspaceExpanded,
        [workspaceId]: !terminalWorkspaceExpanded[workspaceId],
      });
    },
    [terminalWorkspaceExpanded, setTerminalWorkspaceExpanded]
  );

  const handleHideTerminalWorkspace = useCallback(
    (workspaceId: string) => {
      const ws = recentWorkspaces.find((r) => r.id === workspaceId);
      if (ws) hideWorkspaceFromRightPanels(workspaceId);
    },
    [recentWorkspaces, hideWorkspaceFromRightPanels]
  );

  return (
    <div className="adl-tool-panel adl-tool-panel--terminal">
      <div className="adl-tool-context adl-tool-context--files" aria-label={t.toolTerminal}>
        <div className="adl-tool-context__group adl-tool-context__group--grow adl-tool-context__group--files">
          <TooltipSimple
            content={navigatorCollapsed ? t.panelToggleRight : t.panelToggleLeft}
            placement="top"
          >
            <button
              type="button"
              className="adl-tool-context__iconbtn adl-tool-context__iconbtn--leading"
              onClick={() => terminalActions.toggleNavigator('terminal')}
              aria-label={navigatorCollapsed ? t.panelToggleRight : t.panelToggleLeft}
            >
              <IconPanelLeftClose size={14} decorative />
            </button>
          </TooltipSimple>
          <div className="adl-tool-context__group--terminal-actions">
            <TerminalShellSelector
              currentProfile={currentProfile}
              currentProfileLabel={currentProfileLabel}
              menuOpen={shellMenuOpen}
              menuItems={shellMenuItems}
              menuRef={shellMenuRef}
              onCreateTab={terminalActions.handleCreateTab}
              onToggle={() => terminalActions.setShellMenuOpen((value) => !value)}
              onSelect={(profile: TerminalProfile) => {
                terminalActions.updateProfile(profile);
                terminalActions.setShellMenuOpen(false);
              }}
              t={t}
            />
          </div>
        </div>
        <div className="adl-tool-context__group adl-tool-context__group--files-actions">
          <TerminalMenuDropdown
            menuOpen={terminalMenuOpen}
            menuRef={terminalMenuRef}
            menuItems={terminalMenuItems}
            onToggle={() => terminalActions.setTerminalMenuOpen((value) => !value)}
            onClose={() => terminalActions.setTerminalMenuOpen(false)}
            t={t}
          />
        </div>
      </div>

      <div
        className={`adl-tool-surface adl-tool-surface--files${navigatorCollapsed ? ' is-navigator-collapsed' : ''}`}
        style={
          {
            '--adl-files-nav-width': `${terminalNavigatorWidth}px`,
          } as React.CSSProperties
        }
      >
        <aside className="adl-tool-navigator">
          <div className="adl-tool-navigator__context">
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
              <TooltipSimple
                content={allTerminalExpanded ? '折叠全部' : '展开全部'}
                placement="top"
              >
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={
                    allTerminalExpanded ? handleCollapseAllTerminal : handleExpandAllTerminal
                  }
                  aria-label={allTerminalExpanded ? '折叠全部' : '展开全部'}
                >
                  {allTerminalExpanded ? (
                    <IconFoldVertical size={14} decorative />
                  ) : (
                    <IconUnfoldVertical size={14} decorative />
                  )}
                </button>
              </TooltipSimple>
              <span className="adl-tool-navigator__context-title">{terminalNavigatorTitle}</span>
            </div>
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility">
              {visibleWorkspaces.length > 0 ? (
                <span className="adl-tool-navigator__context-count">{visibleTabCount}</span>
              ) : null}
              <TooltipSimple content="刷新全部" placement="top">
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={handleRefreshAllTerminal}
                  aria-label="刷新全部"
                >
                  <IconRefreshCw size={14} decorative />
                </button>
              </TooltipSimple>
            </div>
          </div>
          <div className="adl-tool-navigator__context adl-tool-navigator__context--secondary">
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
              <TooltipSimple content="终端" placement="top">
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${navigatorMode === 'sessions' ? ' is-active' : ''}`}
                  onClick={() => terminalActions.setNavigatorMode('sessions')}
                  aria-label="终端"
                  aria-pressed={navigatorMode === 'sessions' ? 'true' : 'false'}
                >
                  <IconFiles size={14} decorative />
                </button>
              </TooltipSimple>
              <TooltipSimple content="命令历史" placement="top">
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${navigatorMode === 'history' ? ' is-active' : ''}`}
                  onClick={() => terminalActions.setNavigatorMode('history')}
                  aria-label="命令历史"
                  aria-pressed={navigatorMode === 'history' ? 'true' : 'false'}
                >
                  <IconFileCode size={14} decorative />
                </button>
              </TooltipSimple>
            </div>
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility">
              <TooltipSimple content="删除全部" placement="top">
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={terminalActions.handleCloseAllTabs}
                  aria-label="删除全部"
                >
                  <IconTrash size={14} decorative />
                </button>
              </TooltipSimple>
            </div>
          </div>
          <MultiWorkspaceTerminal
            workspaces={visibleWorkspaces}
            expandedStates={terminalWorkspaceExpanded}
            terminalTabs={terminalTabs}
            activeTabId={terminalActiveTabId}
            onToggleExpand={toggleTerminalWorkspaceExpanded}
            onCreateTab={(wsId) => terminalActions.handleCreateTab(undefined, wsId)}
            onSelectTab={terminalSelectTab}
            onCloseTab={terminalCloseTab}
            onTogglePin={terminalTogglePin}
            onHideFromRightPanels={handleHideTerminalWorkspace}
            onRefreshTree={handleRefreshAllTerminal}
            onCloseAllTabs={terminalActions.handleCloseAllTabs}
            t={props.t}
          />
          <div
            className="adl-tool-navigator__resize-handle"
            onPointerDown={terminalActions.handleNavigatorResizeStart}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize terminal navigator"
            aria-valuemin={180}
            aria-valuemax={300}
            aria-valuenow={terminalNavigatorWidth}
          />
        </aside>

        <div className="adl-tool-primary">
          <div className="adl-tool-primary__scroll adl-tool-primary__scroll--terminal">
            {hasActiveTab ? (
              <>
                <XtermTerminal
                  ref={xtermRef}
                  className="adl-terminal-canvas"
                  onData={terminalActions.handleXtermData}
                  onResize={terminalActions.handleXtermResize}
                />
                {latestCommandRun?.status === 'waiting-approval' && (
                  <div className="adl-terminal-approval-hint">
                    <span>{t.terminalNeedsApproval}</span>
                    <button
                      type="button"
                      className="adl-btn adl-btn--primary adl-btn--xs"
                      onClick={() => setActiveRightTool('audit')}
                    >
                      {t.terminalGoToApproval}
                    </button>
                  </div>
                )}
                {activeTab?.status === 'terminated' && !activeTab?.sessionId && (
                  <div className="adl-terminal-error-note">
                    <span>{'\u26A0'}</span>
                    <span>{t.terminalShellNotFound}</span>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>

      <TerminalContextMenu
        contextMenu={contextMenu}
        onTogglePin={terminalActions.handleTogglePin}
        onRename={handleRenameFromContextMenu(
          terminalTabs,
          contextMenu,
          terminalActions.handleDoubleClick
        )}
        onDelete={handleDeleteFromContextMenu(contextMenu, terminalActions.handleCloseTab)}
        onClose={noop}
        t={t}
      />
    </div>
  );
}

function handleRenameFromContextMenu(
  terminalTabs: Array<{ id: string; title: string }>,
  contextMenu: { tabId: string | null },
  handleDoubleClick: (tabId: string, title: string) => void
): () => void {
  return () => {
    if (contextMenu.tabId) {
      const tab = terminalTabs.find((t) => t.id === contextMenu.tabId);
      if (tab) {
        handleDoubleClick(contextMenu.tabId, tab.title);
      }
    }
  };
}

function handleDeleteFromContextMenu(
  contextMenu: { tabId: string | null },
  handleCloseTab: (tabId: string) => void
): () => void {
  return () => {
    if (contextMenu.tabId) {
      handleCloseTab(contextMenu.tabId);
    }
  };
}

function noop(): void {}
