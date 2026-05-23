import React, { useCallback, useMemo } from "react";
import { useAppStore } from "../../stores/slicedStore";
import { IconFiles, IconFileCode, IconFoldVertical, IconPanelLeftClose, IconRefreshCw, IconTrash, IconUnfoldVertical } from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";
import { XtermTerminal } from "../../components/terminal/XtermTerminal";
import { countGitChanges } from "../../regions/right-panel/types";
import type { RightPanelViewProps } from "../../regions/right-panel/types";
import type { TerminalProfile } from "../../ui-store";
import { useTerminalPanel } from "./useTerminalPanel";
import { TerminalShellSelector } from "./TerminalShellSelector";
import { TerminalMenuDropdown } from "./TerminalMenuDropdown";
import { TerminalEmptyState } from "./TerminalEmptyState";
import { TerminalContextMenu } from "./TerminalContextMenu";
import { MultiWorkspaceTerminal } from "../workspace-terminal";
import type { RecentWorkspaceEntry } from "@ai-digital-life/kernel";

export function TerminalPanel(props: RightPanelViewProps) {
  const {
    t,
    latestCommandRun,
  } = props;

  const setActiveRightTool = useAppStore((state) => state.setActiveRightTool);
  const recentWorkspaces = useAppStore((s) => s.recentWorkspaces);
  const terminalWorkspaceExpanded = useAppStore((s) => s.terminalWorkspaceExpanded);
  const setTerminalWorkspaceExpanded = useAppStore((s) => s.setTerminalWorkspaceExpanded);
  const terminalCreateTab = useAppStore((s) => s.terminalCreateTab);
  const terminalSelectTab = useAppStore((s) => s.terminalSelectTab);
  const terminalCloseTab = useAppStore((s) => s.terminalCloseTab);
  const terminalTogglePin = useAppStore((s) => s.terminalTogglePin);
  const hideWorkspaceFromRightPanels = useAppStore((s) => s.hideWorkspaceFromRightPanels);

  const {
    xtermRef,
    editInputRef,
    shellMenuRef,
    terminalMenuRef,
    navigatorMode,
    shellMenuOpen,
    terminalMenuOpen,
    contextMenu,
    editingTabId,
    editValue,
    isDragging,
    dragOverTabId,
    terminalTabs,
    terminalActiveTabId,
    terminalNavigatorWidth,
    navigatorCollapsed,
    activeTab,
    hasActiveTab,
    currentProfile,
    currentProfileLabel,
    defaultTerminalProfile,
    navigatorTitle,
    navigatorCount,
    recentCommands,
    shellMenuItems,
    shellTypeItems,
    terminalMenuItems,
    handleCreateTab,
    handleSelectTab,
    handleCloseTab,
    handleCloseAllTabs,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
    handleTogglePin,
    handleContextMenu,
    handleDoubleClick,
    handleEditSubmit,
    handleEditKeyDown,
    handleCopy,
    handlePaste,
    handleClear,
    handleKill,
    updateProfile,
    toggleNavigator,
    handleNavigatorResizeStart,
    handleXtermData,
    handleXtermResize,
    setNavigatorMode,
    setShellMenuOpen,
    setTerminalMenuOpen,
    setEditValue,
  } = useTerminalPanel(props);

  const visibleWorkspaces = useMemo(
    () => recentWorkspaces.filter((w) => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available),
    [recentWorkspaces]
  );

  const allTerminalExpanded = useMemo(() => {
    return visibleWorkspaces.length > 0 && visibleWorkspaces.every((w) => terminalWorkspaceExpanded[w.id]);
  }, [visibleWorkspaces, terminalWorkspaceExpanded]);

  const terminalNavigatorTitle = navigatorMode === "history" ? "命令历史" : "终端";

  const handleExpandAllTerminal = useCallback(() => {
    const expanded: Record<string, boolean> = {};
    for (const ws of visibleWorkspaces) {
      expanded[ws.id] = true;
    }
    setTerminalWorkspaceExpanded(expanded);
  }, [visibleWorkspaces, setTerminalWorkspaceExpanded]);

  const handleCollapseAllTerminal = useCallback(() => {
    setTerminalWorkspaceExpanded({});
  }, [setTerminalWorkspaceExpanded]);

  const visibleTabCount = useMemo(() => {
    let count = 0;
    for (const ws of visibleWorkspaces) {
      count += terminalTabs.filter(t => t.workspaceId === ws.id).length;
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

  const toggleTerminalWorkspaceExpanded = useCallback((workspaceId: string) => {
    setTerminalWorkspaceExpanded({
      ...terminalWorkspaceExpanded,
      [workspaceId]: !terminalWorkspaceExpanded[workspaceId]
    });
  }, [terminalWorkspaceExpanded, setTerminalWorkspaceExpanded]);

  const handleHideTerminalWorkspace = useCallback((workspaceId: string) => {
    const ws = recentWorkspaces.find(r => r.id === workspaceId);
    if (ws) hideWorkspaceFromRightPanels(workspaceId);
  }, [recentWorkspaces, hideWorkspaceFromRightPanels]);

  return (
    <div className="adl-tool-panel adl-tool-panel--terminal">
      <div className="adl-tool-context adl-tool-context--files" aria-label={t.toolTerminal}>
        <div className="adl-tool-context__group adl-tool-context__group--grow adl-tool-context__group--files">
          <TooltipSimple content={navigatorCollapsed ? t.panelToggleRight : t.panelToggleLeft} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn adl-tool-context__iconbtn--leading"
              onClick={() => toggleNavigator("terminal")}
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
              onCreateTab={handleCreateTab}
              onToggle={() => setShellMenuOpen((value) => !value)}
              onSelect={(profile: TerminalProfile) => {
                updateProfile(profile);
                setShellMenuOpen(false);
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
            onToggle={() => setTerminalMenuOpen((value) => !value)}
            onClose={() => setTerminalMenuOpen(false)}
            t={t}
          />
        </div>
      </div>

      <div
        className={`adl-tool-surface adl-tool-surface--files${navigatorCollapsed ? " is-navigator-collapsed" : ""}`}
        style={{ "--adl-files-nav-width": `${terminalNavigatorWidth}px` } as React.CSSProperties}
      >
        <aside className="adl-tool-navigator">
          <div className="adl-tool-navigator__context">
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
              <TooltipSimple content={allTerminalExpanded ? "折叠全部" : "展开全部"} placement="top">
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={allTerminalExpanded ? handleCollapseAllTerminal : handleExpandAllTerminal}
                  aria-label={allTerminalExpanded ? "折叠全部" : "展开全部"}
                >
                  {allTerminalExpanded ? <IconFoldVertical size={14} decorative /> : <IconUnfoldVertical size={14} decorative />}
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
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${navigatorMode === "sessions" ? " is-active" : ""}`}
                  onClick={() => setNavigatorMode("sessions")}
                  aria-label="终端"
                  aria-pressed={navigatorMode === "sessions" ? "true" : "false"}
                >
                  <IconFiles size={14} decorative />
                </button>
              </TooltipSimple>
              <TooltipSimple content="命令历史" placement="top">
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${navigatorMode === "history" ? " is-active" : ""}`}
                  onClick={() => setNavigatorMode("history")}
                  aria-label="命令历史"
                  aria-pressed={navigatorMode === "history" ? "true" : "false"}
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
                  onClick={handleCloseAllTabs}
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
            onCreateTab={(wsId) => terminalCreateTab(defaultTerminalProfile, wsId)}
            onSelectTab={terminalSelectTab}
            onCloseTab={terminalCloseTab}
            onTogglePin={terminalTogglePin}
            onHideFromRightPanels={handleHideTerminalWorkspace}
            onRefreshTree={handleRefreshAllTerminal}
            onCloseAllTabs={handleCloseAllTabs}
            t={props.t}
          />
        </aside>

        <div className="adl-tool-primary">
          <div className="adl-tool-primary__scroll adl-tool-primary__scroll--terminal">
            {hasActiveTab ? (
              <>
                <XtermTerminal
                  ref={xtermRef}
                  className="adl-terminal-canvas"
                  onData={handleXtermData}
                  onResize={handleXtermResize}
                />
                {latestCommandRun?.status === "waiting-approval" && (
                  <div className="adl-terminal-approval-hint">
                    <span>{t.terminalNeedsApproval}</span>
                    <button
                      type="button"
                      className="adl-btn adl-btn--primary adl-btn--xs"
                      onClick={() => setActiveRightTool("audit")}
                    >
                      {t.terminalGoToApproval}
                    </button>
                  </div>
                )}
                {activeTab!.status === "terminated" && !activeTab!.sessionId && (
                  <div className="adl-terminal-error-note">
                    <span>{"\u26A0"}</span>
                    <span>{t.terminalShellNotFound}</span>
                  </div>
                )}
              </>
            ) : (
              <TerminalEmptyState
                shellTypeItems={shellTypeItems}
                onSelectProfile={handleCreateTab}
                t={t}
              />
            )}
          </div>
        </div>
      </div>

      <TerminalContextMenu
        contextMenu={contextMenu}
        onTogglePin={handleTogglePin}
        onRename={handleRenameFromContextMenu(terminalTabs, contextMenu, handleDoubleClick)}
        onDelete={handleDeleteFromContextMenu(contextMenu, handleCloseTab)}
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
      const tab = terminalTabs.find(t => t.id === contextMenu.tabId);
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
