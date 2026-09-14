import { useCallback, useMemo } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import {
  IconTerminalDirectory,
  IconTerminalCommandHistory,
  IconFoldVertical,
  IconPanelLeft,
  IconPanelLeftClose,
  IconDelete,
  IconUnfoldVertical,
  IconAreaSwap,
} from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { NavigatorResizeHandle } from '@components/NavigatorResizeHandle';
import { asWorkspaceID } from '@shared/branded';
import { XtermTerminal } from '@components/terminal/XtermTerminal';
import { TerminalHistoryList } from '@components/terminal/TerminalHistoryList';
import { TerminalRegionActions } from '@components/terminal/TerminalRegionActions';
import { readTerminalPalette, readTerminalCellMetrics } from '@features/terminal/terminalXtermPool';
import {
  isCollapseButtonVisible,
  isRegionVisible,
} from '@features/terminal/terminalRegionCollapse';
import type { RegionName } from '@features/terminal/terminalRegionCollapse';
import type { TerminalProfile } from '@stores/types';
import { useTerminalPanel } from './useTerminalPanel';
import { HISTORY_RATIO_MAX, HISTORY_RATIO_MIN } from './terminalViewPrefs';
import { TerminalShellSelector } from './TerminalShellSelector';
import { TerminalMenuDropdown } from './TerminalMenuDropdown';
import { TerminalContextMenu } from './TerminalContextMenu';
import { MultiWorkspaceTerminal } from '../workspace-terminal';
import { useTCopy } from '@i18n/useTCopy';

export function TerminalPanel() {
  const { t } = useTCopy();

  const {
    recentWorkspaces,
    terminalWorkspaceExpanded,
    setTerminalWorkspaceExpanded,
    terminalCloseTab,
    terminalTogglePin,
    removeWorkspaceFromSidebar,
  } = useAppStore(
    useShallow((s) => ({
      recentWorkspaces: s.recentWorkspaces,
      terminalWorkspaceExpanded: s.terminalWorkspaceExpanded,
      setTerminalWorkspaceExpanded: s.setTerminalWorkspaceExpanded,
      terminalCloseTab: s.terminalCloseTab,
      terminalTogglePin: s.terminalTogglePin,
      removeWorkspaceFromSidebar: s.removeWorkspaceFromSidebar,
    })),
  );

  const { terminalState, terminalActions } = useTerminalPanel();
  const {
    activeTab,
    hasActiveTab,
    regionCollapse,
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
    viewContainerRef,
    viewPrefs,
    historySegments,
    contextMenu,
    editingTabId,
    editValue,
    editInputRef,
  } = terminalState;

  const hasHistory = historySegments.length > 0;
  const isDual = viewPrefs.mode === 'dual';
  const INDEPENDENT_WORKSPACE_ID = '__independent__';

  const historyVisible = isRegionVisible(regionCollapse, 'history', hasHistory);
  const liveVisible = isRegionVisible(regionCollapse, 'live', true);
  const canCollapse = isCollapseButtonVisible(hasHistory);

  // 每个区域的叠加层文案都来自 i18n 键（无硬编码字符串）；
  // regionName 设为该叠加层所属区域，使 {region} 模板解析为正确的区域名。
  const regionActionTitles = (region: RegionName) => ({
    collapse: t.terminalRegionCollapseTitle,
    expand: t.terminalRegionExpandTitle,
    regionName: region === 'history' ? t.terminalHistoryRegionName : t.terminalLiveRegionName,
    deleteLabel: t.terminalHistoryDeleteLabel,
    deleteTitle: t.terminalHistoryDeleteTitle,
    clearLabel: t.terminalLiveClearLabel,
    clearTitle: t.terminalLiveClearTitle,
  });

  // 绑定当前 session：把 sessionId 缝进度量读取器，并 memo 化避免每个渲染帧都重建
  // 闭包（否则 TerminalHistoryList 的实测 effect 会随父组件重渲染反复重跑）。
  const readHistoryCellMetrics = useCallback(
    () => readTerminalCellMetrics(activeTab?.sessionId ?? null),
    [activeTab?.sessionId],
  );

  const visibleWorkspaces = useMemo(
    () => recentWorkspaces.filter((w) => !w.removedFromSidebar && w.available),
    [recentWorkspaces],
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

  const terminalNavigatorTitle = navigatorMode === 'history' ? t.terminalHistory : t.terminalLabel;

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
      (t) => !t.workspaceId || t.workspaceId === INDEPENDENT_WORKSPACE_ID,
    ).length;
    for (const ws of visibleWorkspaces) {
      count += terminalTabs.filter((t) => t.workspaceId === ws.id).length;
    }
    return count;
  }, [visibleWorkspaces, terminalTabs]);

  const toggleTerminalWorkspaceExpanded = useCallback(
    (workspaceId: string) => {
      setTerminalWorkspaceExpanded({
        ...terminalWorkspaceExpanded,
        [workspaceId]: !terminalWorkspaceExpanded[workspaceId],
      });
    },
    [terminalWorkspaceExpanded, setTerminalWorkspaceExpanded],
  );

  const handleHideTerminalWorkspace = useCallback(
    (workspaceId: string) => {
      const ws = recentWorkspaces.find((r) => r.id === workspaceId);
      if (ws) {
        void removeWorkspaceFromSidebar(asWorkspaceID(workspaceId));
      }
    },
    [recentWorkspaces, removeWorkspaceFromSidebar],
  );

  return (
    <div className="adl-tool-panel adl-tool-panel--terminal">
      <div className="adl-tool-context adl-tool-context--files" aria-label={t.toolTerminal}>
        <div className="adl-tool-context__group adl-tool-context__group--grow adl-tool-context__group--files">
          <TooltipSimple content={t.panelNavigatorToggle} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn adl-tool-context__iconbtn--leading"
              onClick={() => terminalActions.toggleNavigator('terminal')}
              aria-label={t.panelNavigatorToggle}
            >
              {navigatorCollapsed ? (
                <IconPanelLeftClose size={14} decorative />
              ) : (
                <IconPanelLeft size={14} decorative />
              )}
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
              onClose={() => terminalActions.setShellMenuOpen(false)}
              onSelect={(profile: TerminalProfile) => {
                terminalActions.updateProfile(profile);
                terminalActions.setShellMenuOpen(false);
              }}
            />
          </div>
        </div>
        <div className="adl-tool-context__group adl-tool-context__group--files-actions">
          <TooltipSimple content={t.terminalViewLayoutLabel} placement="top">
            <div
              className="adl-tool-context__diff-view"
              role="group"
              aria-label={t.terminalViewLayoutLabel}
            >
              <button
                type="button"
                className={`adl-tool-context__toggle-btn${isDual ? '' : ' is-active'}`}
                aria-pressed={isDual ? 'false' : 'true'}
                onClick={() => terminalActions.setViewMode('single')}
              >
                {t.terminalViewSingle}
              </button>
              <button
                type="button"
                className={`adl-tool-context__toggle-btn${isDual ? ' is-active' : ''}`}
                aria-pressed={isDual ? 'true' : 'false'}
                onClick={() => terminalActions.setViewMode('dual')}
              >
                {t.terminalViewDual}
              </button>
            </div>
          </TooltipSimple>
          <TooltipSimple content={t.terminalSwapAreas} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn"
              onClick={terminalActions.swapAreas}
              aria-label={t.terminalSwapAreas}
              disabled={!hasHistory}
            >
              <IconAreaSwap
                size={14}
                decorative
                orientation={isDual ? 'horizontal' : 'vertical'}
                firstSolid={viewPrefs.historyFirst}
              />
            </button>
          </TooltipSimple>
          <TerminalMenuDropdown
            menuOpen={terminalMenuOpen}
            menuRef={terminalMenuRef}
            menuItems={terminalMenuItems}
            onToggle={() => terminalActions.setTerminalMenuOpen((value) => !value)}
            onClose={() => terminalActions.setTerminalMenuOpen(false)}
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
                content={allTerminalExpanded ? t.terminalCollapseAll : t.terminalExpandAll}
                placement="top"
              >
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={
                    allTerminalExpanded ? handleCollapseAllTerminal : handleExpandAllTerminal
                  }
                  aria-label={allTerminalExpanded ? t.terminalCollapseAll : t.terminalExpandAll}
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
            </div>
          </div>
          <div className="adl-tool-navigator__context adl-tool-navigator__context--secondary">
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
              <TooltipSimple content={t.terminalLabel} placement="top">
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${navigatorMode === 'sessions' ? ' is-active' : ''}`}
                  onClick={() => terminalActions.setNavigatorMode('sessions')}
                  aria-label={t.terminalLabel}
                  aria-pressed={navigatorMode === 'sessions' ? 'true' : 'false'}
                >
                  <IconTerminalDirectory size={14} decorative />
                </button>
              </TooltipSimple>
              <TooltipSimple content={t.terminalCommandHistory} placement="top">
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${navigatorMode === 'history' ? ' is-active' : ''}`}
                  onClick={() => terminalActions.setNavigatorMode('history')}
                  aria-label={t.terminalCommandHistory}
                  aria-pressed={navigatorMode === 'history' ? 'true' : 'false'}
                >
                  <IconTerminalCommandHistory size={14} decorative />
                </button>
              </TooltipSimple>
            </div>
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility">
              <TooltipSimple
                content={
                  navigatorMode === 'sessions' ? t.terminalClearAllTabs : t.terminalClearAllHistory
                }
                placement="top"
              >
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={
                    navigatorMode === 'sessions'
                      ? () => terminalActions.handleCloseAllTabs()
                      : terminalActions.handleClearCommandHistory
                  }
                  aria-label={
                    navigatorMode === 'sessions'
                      ? t.terminalClearAllTabs
                      : t.terminalClearAllHistory
                  }
                >
                  <IconDelete size={14} decorative />
                </button>
              </TooltipSimple>
            </div>
          </div>
          <MultiWorkspaceTerminal
            workspaces={visibleWorkspaces}
            expandedStates={terminalWorkspaceExpanded}
            terminalTabs={terminalTabs}
            activeTabId={terminalActiveTabId}
            editingTabId={editingTabId}
            editValue={editValue}
            editInputRef={editInputRef}
            onToggleExpand={toggleTerminalWorkspaceExpanded}
            onCreateTab={(wsId) => terminalActions.handleCreateTab(undefined, wsId)}
            onSelectTab={terminalActions.handleSelectTab}
            onCloseTab={terminalCloseTab}
            onTogglePin={terminalTogglePin}
            onHideFromRightPanels={handleHideTerminalWorkspace}
            onCloseAllTabs={terminalActions.handleCloseAllTabs}
            onDoubleClick={terminalActions.handleDoubleClick}
            onEditChange={terminalActions.setEditValue}
            onEditSubmit={terminalActions.handleEditSubmit}
            onEditKeyDown={terminalActions.handleEditKeyDown}
          />
          <NavigatorResizeHandle
            label="Resize terminal navigator"
            minWidth={180}
            maxWidth={300}
            currentWidth={terminalNavigatorWidth}
            onPointerDown={terminalActions.handleNavigatorResizeStart}
          />
        </aside>

        <div className="adl-tool-primary">
          <div
            ref={viewContainerRef}
            className={`adl-tool-primary__scroll adl-tool-primary__scroll--terminal${isDual ? ' is-dual' : ' is-single'}${viewPrefs.historyFirst ? '' : ' is-history-last'}${hasActiveTab ? '' : ' is-empty'}`}
            style={
              {
                '--adl-terminal-history-ratio': `${viewPrefs.historyRatio}`,
              } as React.CSSProperties
            }
          >
            {hasActiveTab ? (
              <>
                {historyVisible ? (
                  <div className={`adl-terminal-history${liveVisible ? '' : ' is-solo'}`}>
                    <TerminalHistoryList
                      segments={historySegments}
                      palette={readTerminalPalette()}
                      readCellMetrics={readHistoryCellMetrics}
                      unavailableLabel={t.terminalHistorySegmentUnavailable}
                    />
                    <TerminalRegionActions
                      region="history"
                      collapsed={regionCollapse !== 'none'}
                      canCollapse={canCollapse}
                      onToggleCollapse={() => terminalActions.toggleRegionCollapse('history')}
                      onDelete={() => void terminalActions.deleteHistory(activeTab?.id ?? '')}
                      titles={regionActionTitles('history')}
                      alwaysVisible={!liveVisible}
                    />
                  </div>
                ) : null}

                {historyVisible && liveVisible ? (
                  <div
                    className="adl-terminal-divider"
                    role="separator"
                    aria-orientation={isDual ? 'vertical' : 'horizontal'}
                    aria-label={t.terminalDividerLabel}
                    aria-valuemin={HISTORY_RATIO_MIN}
                    aria-valuemax={HISTORY_RATIO_MAX}
                    aria-valuenow={Math.round(viewPrefs.historyRatio * 100) / 100}
                    onPointerDown={terminalActions.handleDividerPointerDown}
                  />
                ) : null}

                {liveVisible ? (
                  <div className="adl-terminal-live">
                    <XtermTerminal
                      ref={xtermRef}
                      sessionId={activeTab?.sessionId ?? null}
                      className="adl-terminal-canvas"
                      onData={terminalActions.handleXtermData}
                      onResize={terminalActions.handleXtermResize}
                    />
                    <TerminalRegionActions
                      region="live"
                      collapsed={regionCollapse !== 'none'}
                      canCollapse={canCollapse}
                      onToggleCollapse={() => terminalActions.toggleRegionCollapse('live')}
                      onClear={terminalActions.handleClear}
                      titles={regionActionTitles('live')}
                      alwaysVisible={!historyVisible}
                    />
                  </div>
                ) : null}
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
          terminalActions.handleDoubleClick,
        )}
        onDelete={handleDeleteFromContextMenu(contextMenu, terminalActions.handleCloseTab)}
        onClose={noop}
      />
    </div>
  );
}

function handleRenameFromContextMenu(
  terminalTabs: { id: string; title: string }[],
  contextMenu: { tabId: string | null },
  handleDoubleClick: (tabId: string, title: string) => void,
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
  handleCloseTab: (tabId: string) => void,
): () => void {
  return () => {
    if (contextMenu.tabId) {
      handleCloseTab(contextMenu.tabId);
    }
  };
}

function noop(): void {}
