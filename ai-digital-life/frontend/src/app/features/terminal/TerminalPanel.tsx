import { useCallback, useMemo } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import {
  IconTerminalDirectory,
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
import type { TerminalProfile } from '@stores/types';
import { useTerminalPanel } from './useTerminalPanel';
import { HISTORY_RATIO_MAX, HISTORY_RATIO_MIN } from './terminalViewPrefs';
import { TerminalShellSelector } from './TerminalShellSelector';
import { TerminalMenuDropdown } from './TerminalMenuDropdown';
import { TerminalContextMenu } from './TerminalContextMenu';
import { MultiWorkspaceTerminal } from '../workspace-terminal';
import { nextTerminalWorkspaceToggleValue } from './terminalWorkspaceToggle';
import { isPanelTab } from '@stores/slices/tabLocation';
import { useTCopy } from '@i18n/useTCopy';
import { useResolvedTheme } from '@hooks/useResolvedTheme';

export function TerminalPanel() {
  const { t } = useTCopy();
  // 订阅主题：手动切换亮/暗主题只改 data-theme 属性，不触发重渲染；
  // 不订阅的话本次渲染不会重新求值 palette，只读历史颜色就跟不上。
  // 返回值本身不用（仅借订阅驱动重渲染）；palette 的直接求值即可，
  // readTerminalPalette 内部按 fg/bg 签名缓存，同主题下引用稳定（memo 化行组件不抖动）。
  useResolvedTheme();
  const historyPalette = readTerminalPalette();

  const {
    recentWorkspaces,
    terminalWorkspaceExpanded,
    setTerminalWorkspaceExpanded,
    terminalTogglePin,
    removeWorkspaceFromSidebar,
  } = useAppStore(
    useShallow((s) => ({
      recentWorkspaces: s.recentWorkspaces,
      terminalWorkspaceExpanded: s.terminalWorkspaceExpanded,
      setTerminalWorkspaceExpanded: s.setTerminalWorkspaceExpanded,
      terminalTogglePin: s.terminalTogglePin,
      removeWorkspaceFromSidebar: s.removeWorkspaceFromSidebar,
    })),
  );

  const { terminalState, terminalActions } = useTerminalPanel();
  const {
    activeTab,
    hasActiveTab,
    regionCollapse,
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

  // 两个区域共用同一份叠加层文案（最大化/还原不再带区域名，见 TerminalRegionActions）；
  // 文案均来自 i18n 键（无硬编码字符串）。
  const regionActionTitles = {
    collapse: t.terminalRegionCollapseTitle,
    expand: t.terminalRegionExpandTitle,
    deleteLabel: t.terminalHistoryDeleteLabel,
    deleteTitle: t.terminalHistoryDeleteTitle,
    clearLabel: t.terminalLiveClearLabel,
    clearTitle: t.terminalLiveClearTitle,
  };

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

  // 左侧导航标题固定为“终端目录”。“命令历史”模式已彻底删除（无入口、无 store），
  // 不要在此处加回 navigatorMode 分支；只读历史区仍在主内容区按标签展示，不受影响。
  const terminalNavigatorTitle = t.terminalLabel;

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
    // 转入中心的终端标签不计入面板计数（spec 目标 #5）。
    const panelTabs = terminalTabs.filter(isPanelTab);
    let count = 0;
    count += panelTabs.filter(
      (t) => !t.workspaceId || t.workspaceId === INDEPENDENT_WORKSPACE_ID,
    ).length;
    for (const ws of visibleWorkspaces) {
      count += panelTabs.filter((t) => t.workspaceId === ws.id).length;
    }
    return count;
  }, [visibleWorkspaces, terminalTabs]);

  const toggleTerminalWorkspaceExpanded = useCallback(
    (workspaceId: string) => {
      setTerminalWorkspaceExpanded({
        ...terminalWorkspaceExpanded,
        [workspaceId]: nextTerminalWorkspaceToggleValue(
          terminalWorkspaceExpanded[workspaceId],
          workspaceId === INDEPENDENT_WORKSPACE_ID,
        ),
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
          <span className="adl-tool-context__separator" aria-hidden="true" />
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
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn is-active"
                  aria-label={t.terminalLabel}
                  aria-pressed="true"
                >
                  <IconTerminalDirectory size={14} decorative />
                </button>
              </TooltipSimple>
              {/* “命令历史”按钮已彻底删除：不再提供最近命令模式切换入口。
                  只读历史区仍在主内容区（TerminalHistoryList）按标签展示，此处无需恢复。 */}
            </div>
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility">
              <TooltipSimple content={t.terminalClearAllTabs} placement="top">
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={() => terminalActions.handleCloseAllTabs()}
                  aria-label={t.terminalClearAllTabs}
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
            onCloseTab={
              /* 必须走 handleCloseTab（按标签杀 PTY、释放 xterm 池、删除历史与目录记录）；
                 直接调 store 的 terminalCloseTab 只移除标签状态，会留下孤儿 PTY 进程与历史段 */
              terminalActions.handleCloseTab
            }
            onTogglePin={terminalTogglePin}
            onHideFromRightPanels={handleHideTerminalWorkspace}
            onCloseAllTabs={terminalActions.handleCloseAllTabs}
            onDoubleClick={terminalActions.handleDoubleClick}
            onEditChange={terminalActions.setEditValue}
            onEditSubmit={terminalActions.handleEditSubmit}
            onEditKeyDown={terminalActions.handleEditKeyDown}
          />
          <NavigatorResizeHandle
            label={t.resizeTerminalNavigator}
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
                      palette={historyPalette}
                      readCellMetrics={readHistoryCellMetrics}
                      unavailableLabel={t.terminalHistorySegmentUnavailable}
                    />
                    <TerminalRegionActions
                      region="history"
                      collapsedRegion={regionCollapse}
                      canCollapse={canCollapse}
                      onToggleCollapse={() => terminalActions.toggleRegionCollapse('history')}
                      onDelete={() => void terminalActions.deleteHistory(activeTab?.id ?? '')}
                      titles={regionActionTitles}
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
                      collapsedRegion={regionCollapse}
                      canCollapse={canCollapse}
                      onToggleCollapse={() => terminalActions.toggleRegionCollapse('live')}
                      onClear={terminalActions.handleClear}
                      titles={regionActionTitles}
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
        onRename={terminalActions.handleRenameFromMenu}
        onOpenInCenter={terminalActions.handleOpenInCenterFromMenu}
        onDelete={terminalActions.handleDeleteFromMenu}
        onClose={terminalActions.closeContextMenu}
      />
    </div>
  );
}
