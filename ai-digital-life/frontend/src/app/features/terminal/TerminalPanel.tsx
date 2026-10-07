import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import {
  IconTerminalDirectory,
  IconFoldVertical,
  IconPanelLeft,
  IconPanelLeftClose,
  IconDelete,
  IconUnfoldVertical,
  IconAddTerminal,
  IconAutoLayout,
  IconCustomLayout,
} from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { NavigatorResizeHandle } from '@components/NavigatorResizeHandle';
import { asWorkspaceID } from '@shared/branded';
import { TerminalPaneGrid } from '@components/terminal/TerminalPaneGrid';
import { TerminalPaneView } from '@components/terminal/TerminalPaneView';
import { TerminalLayoutCard } from '@components/terminal/TerminalLayoutCard';
import type { TerminalProfile } from '@stores/types';
import { useTerminalPanel } from './useTerminalPanel';
import { TerminalShellSelector } from './TerminalShellSelector';
import { TerminalMenuDropdown } from './TerminalMenuDropdown';
import { TerminalContextMenu } from './TerminalContextMenu';
import { MultiWorkspaceTerminal } from '../workspace-terminal';
import { nextTerminalWorkspaceToggleValue } from './terminalWorkspaceToggle';
import { isPanelTab } from '@stores/slices/tabLocation';
import { useTCopy } from '@i18n/useTCopy';
import { useTerminalPaneLayout } from './useTerminalPaneLayout';
import { useLayoutCard } from './useLayoutCard';

export function TerminalPanel() {
  const { t } = useTCopy();

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
    contextMenu,
    editingTabId,
    editValue,
    editInputRef,
  } = terminalState;

  // 窗格最大化态为面板本地态：切换标签、增删窗格或切换布局模式时复位
  // （spec §8：均分/自由切换清空最大化，避免指向被模式切换改变几何的窗格）。
  const [maximizedPaneId, setMaximizedPaneId] = useState<string | null>(null);
  const paneCount = activeTab?.panes.length ?? 0;

  // 布局容器：包裹终端网格的滚动区。C2 布局 Hook 拖拽期在其上写 CSS 变量
  // （`--adl-term-*`），并测量其尺寸换算拖拽比例；变量沿 DOM 继承到内层网格。
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const paneIds = useMemo(() => activeTab?.panes.map((pane) => pane.id) ?? [], [activeTab]);
  const {
    layout: paneLayout,
    setMode: setPaneLayoutMode,
    resetAuto: resetPaneLayout,
    handleColDividerPointerDown,
    handleRowDividerPointerDown,
    handleFreeDragPointerDown,
  } = useTerminalPaneLayout({
    containerRef: gridContainerRef,
    activeTabId: activeTab?.id,
    paneCount,
    paneIds,
  });

  // 用 useLayoutEffect 在 DOM 变更后、浏览器绘制前复位，避免切标签/切模式时出现一帧“空窗格”。
  useLayoutEffect(() => {
    setMaximizedPaneId(null);
  }, [terminalActiveTabId, paneCount, paneLayout.mode]);

  // 自定义布局卡片：开合本地态 + 锚点 ref + 外部点击/Esc 关闭（共享 Hook）。
  const {
    open: layoutCardOpen,
    anchorRef: layoutCardRef,
    toggle: toggleLayoutCard,
    close: closeLayoutCard,
  } = useLayoutCard();

  const INDEPENDENT_WORKSPACE_ID = '__independent__';

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

  // 左侧导航标题固定为“终端目录”。“命令历史”模式与只读历史区均已彻底删除
  // （无入口、无 store、无主区展示），不要在此处加回 navigatorMode 分支。
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
          <div
            className="adl-tool-context__diff-view"
            role="group"
            aria-label={t.terminalLayoutModeLabel}
          >
            <button
              type="button"
              className={`adl-tool-context__toggle-btn${paneLayout.mode === 'equal' ? ' is-active' : ''}`}
              aria-pressed={paneLayout.mode === 'equal'}
              disabled={!hasActiveTab}
              onClick={() => setPaneLayoutMode('equal')}
            >
              {t.terminalLayoutEqual}
            </button>
            <button
              type="button"
              className={`adl-tool-context__toggle-btn${paneLayout.mode === 'free' ? ' is-active' : ''}`}
              aria-pressed={paneLayout.mode === 'free'}
              disabled={!hasActiveTab}
              onClick={() => setPaneLayoutMode('free')}
            >
              {t.terminalLayoutFree}
            </button>
          </div>
          <TooltipSimple content={t.terminalAutoLayout} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn"
              onClick={resetPaneLayout}
              aria-label={t.terminalAutoLayout}
              disabled={!hasActiveTab}
            >
              <IconAutoLayout size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.terminalAddPane} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn"
              onClick={() => terminalActions.handleAddPane()}
              aria-label={t.terminalAddPane}
            >
              <IconAddTerminal size={14} decorative />
            </button>
          </TooltipSimple>
          <div className="adl-layout-card-anchor" ref={layoutCardRef}>
            <TooltipSimple content={t.terminalCustomLayout} placement="top">
              <button
                type="button"
                className={`adl-tool-context__iconbtn${layoutCardOpen ? ' is-open' : ''}`}
                onClick={toggleLayoutCard}
                aria-label={t.terminalCustomLayout}
                aria-haspopup="dialog"
                aria-expanded={layoutCardOpen}
                disabled={!hasActiveTab}
              >
                <IconCustomLayout size={14} decorative />
              </button>
            </TooltipSimple>
            {layoutCardOpen && activeTab ? (
              <TerminalLayoutCard
                panes={activeTab.panes}
                onMove={terminalActions.handleReorderPanes}
                onSwap={terminalActions.handleSwapPanes}
                onLabelChange={terminalActions.handlePaneLabelChange}
                onClose={closeLayoutCard}
              />
            ) : null}
          </div>
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
              {/* “命令历史”按钮与只读历史区均已彻底删除，此处无需恢复。 */}
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
            className={`adl-tool-primary__scroll adl-tool-primary__scroll--terminal${hasActiveTab ? '' : ' is-empty'}`}
            ref={gridContainerRef}
          >
            {hasActiveTab && activeTab ? (
              <TerminalPaneGrid
                panes={activeTab.panes}
                activePaneId={terminalState.activePane?.id}
                maximizedPaneId={maximizedPaneId}
                layout={paneLayout}
                dividerLabel={t.terminalPaneResizeDivider}
                onColDividerPointerDown={handleColDividerPointerDown}
                onRowDividerPointerDown={handleRowDividerPointerDown}
                onFreeDragPointerDown={handleFreeDragPointerDown}
                renderPane={(pane) => (
                  <TerminalPaneView
                    pane={pane}
                    isActive={pane.id === terminalState.activePane?.id}
                    isMaximized={maximizedPaneId === pane.id}
                    onActivate={() => terminalActions.handleSelectPane(pane.id)}
                    onClose={() => terminalActions.handleClosePane(pane.id)}
                    onToggleMaximize={() =>
                      setMaximizedPaneId((cur) => (cur === pane.id ? null : pane.id))
                    }
                    onData={(data) => terminalActions.handleXtermData(pane.id, data)}
                    onResize={(cols, rows) =>
                      terminalActions.handleXtermResize(pane.id, cols, rows)
                    }
                    titles={{
                      clear: t.terminalPaneClearLabel,
                      maximize: t.terminalPaneMaximize,
                      restore: t.terminalPaneRestore,
                      close: t.terminalPaneClose,
                    }}
                  />
                )}
              />
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
