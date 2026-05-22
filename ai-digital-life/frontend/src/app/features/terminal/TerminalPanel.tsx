import React from "react";
import { useAppStore } from "../../stores/slicedStore";
import { IconPanelLeftClose } from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";
import { XtermTerminal } from "../../components/terminal/XtermTerminal";
import type { RightPanelViewProps } from "../../regions/right-panel/types";
import type { TerminalProfile } from "../../ui-store";
import { useTerminalPanel } from "./useTerminalPanel";
import { TerminalShellSelector } from "./TerminalShellSelector";
import { TerminalMenuDropdown } from "./TerminalMenuDropdown";
import { TerminalNavigator } from "./TerminalNavigator";
import { TerminalEmptyState } from "./TerminalEmptyState";
import { TerminalContextMenu } from "./TerminalContextMenu";

export function TerminalPanel(props: RightPanelViewProps) {
  const {
    t,
    latestCommandRun,
  } = props;

  const setActiveRightTool = useAppStore((state) => state.setActiveRightTool);

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
        <TerminalNavigator
          navigatorMode={navigatorMode}
          navigatorTitle={navigatorTitle}
          navigatorCount={navigatorCount}
          navigatorCollapsed={navigatorCollapsed}
          terminalNavigatorWidth={terminalNavigatorWidth}
          terminalTabs={terminalTabs}
          terminalActiveTabId={terminalActiveTabId}
          recentCommands={recentCommands}
          editingTabId={editingTabId}
          editValue={editValue}
          editInputRef={editInputRef}
          isDragging={isDragging}
          dragOverTabId={dragOverTabId}
          onModeChange={setNavigatorMode}
          onToggleNavigator={toggleNavigator}
          onCloseAllTabs={handleCloseAllTabs}
          onSelectTab={handleSelectTab}
          onCloseTab={handleCloseTab}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onContextMenu={handleContextMenu}
          onDoubleClick={handleDoubleClick}
          onEditChange={setEditValue}
          onEditSubmit={handleEditSubmit}
          onEditKeyDown={handleEditKeyDown}
          onResizeStart={handleNavigatorResizeStart}
          t={t}
        />

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
