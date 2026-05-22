import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  IconChevronDown,
  IconClose,
  IconFileCode,
  IconMoreVertical,
  IconPanelLeftClose,
  IconPlus,
  IconTerminal,
  IconTrash,
  IconPin,
  IconPinOff,
  IconEdit
} from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";
import { XtermTerminal, type XtermTerminalHandle } from "../../components/terminal/XtermTerminal";
import { type TerminalProfile } from "../../ui-store";
import { useNavigatorResize } from "../../hooks/useNavigatorResize";
import type { RightPanelViewProps } from "../../regions/right-panel/types";
import { useAppStore } from "../../stores/slicedStore";
import { terminalSelectors } from "../../stores/selectors";

type TerminalNavigatorMode = "sessions" | "history";
type TerminalMenuItem =
  | { id: string; separator: true }
  | { id: string; label: string; disabled?: boolean; action?: () => void };
type TerminalShellMenuItem =
  | { id: string; separator: true }
  | { id: string; label: string; profile?: TerminalProfile; action: () => void };

interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  tabId: string | null;
  isPinned: boolean;
}

function ShellPrefix({ profile }: { profile?: TerminalProfile }) {
  const map: Record<string, { text: string; color: string }> = {
    powershell: { text: "PS", color: "var(--green, #4ade80)" },
    cmd: { text: ">", color: "var(--blue, #60a5fa)" },
    bash: { text: "$", color: "var(--yellow, #facc15)" },
  };
  const entry = map[profile ?? "powershell"];
  return (
    <span
      className="adl-terminal-empty__prefix"
      style={{ color: entry?.color }}
    >
      {entry?.text ?? "$"}
    </span>
  );
}

export function TerminalPanel(props: RightPanelViewProps) {
  const { t } = props;
  const [navigatorMode, setNavigatorMode] = useState<TerminalNavigatorMode>("sessions");
  const [terminalMenuOpen, setTerminalMenuOpen] = useState(false);
  const [shellMenuOpen, setShellMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    open: false,
    x: 0,
    y: 0,
    tabId: null,
    isPinned: false
  });
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);

  const navigatorCollapsed = terminalSelectors.useNavigatorCollapsedByTool().terminal;
  const terminalTabs = terminalSelectors.useTerminalTabs();
  const terminalActiveTabId = terminalSelectors.useTerminalActiveTabId();
  const defaultTerminalProfile = terminalSelectors.useDefaultTerminalProfile();
  const terminalNavigatorWidth = terminalSelectors.useTerminalNavigatorWidth();

  const terminalCreateTab = useAppStore((state) => state.terminalCreateTab);
  const terminalSelectTab = useAppStore((state) => state.terminalSelectTab);
  const terminalCloseTab = useAppStore((state) => state.terminalCloseTab);
  const terminalUpdateActiveTab = useAppStore((state) => state.terminalUpdateActiveTab);
  const terminalUpdateTab = useAppStore((state) => state.terminalUpdateTab);
  const terminalTogglePin = useAppStore((state) => state.terminalTogglePin);
  const terminalReorderTabs = useAppStore((state) => state.terminalReorderTabs);
  const setDefaultTerminalProfile = useAppStore((state) => state.setDefaultTerminalProfile);
  const setTerminalNavigatorWidth = useAppStore((state) => state.setTerminalNavigatorWidth);
  const toggleTerminalNavigator = useAppStore((state) => state.toggleTerminalNavigator);
  const terminalCloseAllTabs = useAppStore((state) => state.terminalCloseAllTabs);
  const setActiveRightTool = useAppStore((state) => state.setActiveRightTool);

  const terminalMenuRef = useRef<HTMLDivElement | null>(null);
  const shellMenuRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<XtermTerminalHandle | null>(null);
  const sessionOutputsRef = useRef<Map<string, string>>(new Map());
  const editInputRef = useRef<HTMLInputElement | null>(null);

  const activeTab = useMemo(
    () => terminalTabs.find((tab) => tab.id === terminalActiveTabId) ?? terminalTabs[0],
    [terminalActiveTabId, terminalTabs]
  );

  const hasActiveTab = activeTab != null;

  const recentCommands = useMemo(
    () => {
      if (props.commandHistory.length > 0) {
        return props.commandHistory.map((entry, index) => ({
          id: `history-${index}`,
          label: entry,
          title: entry.split(" ")[0] || t.terminalCommandHistory
        }));
      }
      return terminalTabs
        .map((tab) => ({
          id: tab.id,
          label: tab.title,
          title: tab.title
        }))
        .filter((entry) => entry.label);
    },
    [props.commandHistory, t.terminalCommandHistory, terminalTabs]
  );

  const handleCreateTab = useCallback(async (profile: TerminalProfile = "powershell") => {
    const shellMap: Record<TerminalProfile, string> = {
      powershell: "powershell",
      bash: "bash",
      cmd: "cmd"
    };
    xtermRef.current?.clear();
    terminalCreateTab(profile);
    const cols = 80;
    const rows = 24;
    const cwd = props.appInfo?.currentWorkspace?.rootPath ?? undefined;
    const result = await window.digitalLife.pty.create({
      shell: shellMap[profile],
      cwd,
      cols,
      rows
    });
    if (result.ok) {
      terminalUpdateActiveTab({ sessionId: result.data.sessionId, status: "running" });
      setTimeout(() => {
        const stored = sessionOutputsRef.current.get(result.data.sessionId) ?? "";
        if (stored) {
          xtermRef.current?.write(stored);
        }
        xtermRef.current?.resize();
        xtermRef.current?.focus();
      }, 50);
    } else {
      terminalUpdateActiveTab({ status: "terminated" });
    }
  }, [terminalCreateTab, terminalUpdateActiveTab, props.appInfo?.currentWorkspace?.rootPath]);

  useEffect(() => {
    if (!terminalMenuOpen && !shellMenuOpen && !contextMenu.open) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!terminalMenuRef.current?.contains(target)) {
        setTerminalMenuOpen(false);
      }
      if (!shellMenuRef.current?.contains(target)) {
        setShellMenuOpen(false);
      }
      if (contextMenu.open) {
        setContextMenu(prev => ({ ...prev, open: false }));
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [shellMenuOpen, terminalMenuOpen, contextMenu.open]);

  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTabId]);

  const toggleNavigator = useCallback((tool: string) => {
    if (tool === "terminal") {
      toggleTerminalNavigator();
    }
  }, [toggleTerminalNavigator]);

  const { handlePointerDown: handleNavigatorResizeStart } = useNavigatorResize({
    onWidthCommit: setTerminalNavigatorWidth,
    minWidth: 180,
    maxWidth: 300
  });

  const navigatorTitle = navigatorMode === "sessions" ? t.terminalSessions : t.terminalRecentCommands;
  const navigatorCount = navigatorMode === "sessions" ? terminalTabs.length : recentCommands.length;

  const updateProfile = useCallback((profile: TerminalProfile) => {
    setDefaultTerminalProfile(profile);
  }, [setDefaultTerminalProfile]);

  const currentProfile = defaultTerminalProfile;
  const currentProfileLabel = currentProfile === "powershell" ? "PowerShell" : currentProfile === "bash" ? "Bash" : "CMD";

  const handleCopy = useCallback(() => {
    const selection = xtermRef.current?.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection).catch(() => {});
    }
  }, []);

  const handlePaste = useCallback(() => {
    navigator.clipboard.readText().then((text) => {
      if (activeTab?.sessionId) {
        window.digitalLife.pty.input(activeTab.sessionId, text);
      }
    }).catch(() => {});
  }, [activeTab?.sessionId]);

  const handleClear = useCallback(() => {
    xtermRef.current?.clear();
  }, []);

  const handleKill = useCallback(() => {
    if (activeTab?.sessionId) {
      window.digitalLife.pty.kill(activeTab.sessionId);
      terminalUpdateActiveTab({ status: "terminated" });
    }
  }, [activeTab?.sessionId, terminalUpdateActiveTab]);

  const handleCloseTab = useCallback((tabId: string) => {
    const tabs = useAppStore.getState().terminalTabs;
    const tab = tabs.find((t) => t.id === tabId);
    if (tab?.sessionId) {
      window.digitalLife.pty.kill(tab.sessionId);
      sessionOutputsRef.current.delete(tab.sessionId);
    }
    terminalCloseTab(tabId);
  }, [terminalCloseTab]);

  const handleCloseAllTabs = useCallback(() => {
    terminalTabs.forEach((tab) => {
      if (tab.sessionId) {
        window.digitalLife.pty.kill(tab.sessionId);
        sessionOutputsRef.current.delete(tab.sessionId);
      }
    });
    terminalCloseAllTabs();
  }, [terminalTabs, terminalCloseAllTabs]);

  const handleSelectTab = useCallback((tabId: string) => {
    terminalSelectTab(tabId);
    const tabs = useAppStore.getState().terminalTabs;
    const tab = tabs.find((t) => t.id === tabId);
    if (tab?.sessionId) {
      const sessionId = tab.sessionId;
      xtermRef.current?.clear();
      setTimeout(() => {
        const stored = sessionOutputsRef.current.get(sessionId) ?? "";
        if (stored) {
          xtermRef.current?.write(stored);
        }
        xtermRef.current?.resize();
        xtermRef.current?.scrollToBottom();
        xtermRef.current?.focus();
      }, 50);
    }
  }, [terminalSelectTab]);

  const handleDoubleClick = useCallback((tabId: string, title: string) => {
    setEditValue(title);
    setEditingTabId(tabId);
  }, []);

  const handleEditSubmit = useCallback(() => {
    if (editingTabId && editValue.trim()) {
      terminalUpdateTab(editingTabId, { title: editValue.trim() });
    }
    setEditingTabId(null);
    setEditValue("");
  }, [editingTabId, editValue, terminalUpdateTab]);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleEditSubmit();
    } else if (e.key === "Escape") {
      setEditingTabId(null);
      setEditValue("");
    }
  }, [handleEditSubmit]);

  const handleContextMenu = useCallback((e: React.MouseEvent, tabId: string, isPinned: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Direct approach: show right at mouse position, no calculations
    setContextMenu({
      open: true,
      x: e.clientX,
      y: e.clientY,
      tabId,
      isPinned
    });
  }, []);

  const handleTogglePin = useCallback(() => {
    if (contextMenu.tabId) {
      terminalTogglePin(contextMenu.tabId);
    }
    setContextMenu(prev => ({ ...prev, open: false }));
  }, [contextMenu.tabId, terminalTogglePin]);

  const handleRenameFromMenu = useCallback(() => {
    if (contextMenu.tabId) {
      const tab = terminalTabs.find(t => t.id === contextMenu.tabId);
      if (tab) {
        handleDoubleClick(contextMenu.tabId, tab.title);
      }
    }
    setContextMenu(prev => ({ ...prev, open: false }));
  }, [contextMenu.tabId, terminalTabs, handleDoubleClick]);

  const handleDeleteFromMenu = useCallback(() => {
    if (contextMenu.tabId) {
      handleCloseTab(contextMenu.tabId);
    }
    setContextMenu(prev => ({ ...prev, open: false }));
  }, [contextMenu.tabId, handleCloseTab]);

  const handleDragStart = useCallback((e: React.DragEvent, tabId: string, isPinned: boolean) => {
    e.dataTransfer.setData("text/plain", tabId);
    e.dataTransfer.setData("application/x-terminal-tab-isPinned", String(isPinned));
    setIsDragging(true);
  }, []);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setDragOverTabId(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, tabId: string, isPinned: boolean) => {
    e.preventDefault();
    const draggedIsPinned = e.dataTransfer.getData("application/x-terminal-tab-isPinned") === "true";
    
    if (draggedIsPinned === isPinned) {
      setDragOverTabId(tabId);
      e.dataTransfer.dropEffect = "move";
    } else {
      e.dataTransfer.dropEffect = "none";
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetTabId: string, targetIsPinned: boolean) => {
    e.preventDefault();
    const draggedTabId = e.dataTransfer.getData("text/plain");
    const draggedIsPinned = e.dataTransfer.getData("application/x-terminal-tab-isPinned") === "true";
    
    if (!draggedTabId || draggedIsPinned !== targetIsPinned || draggedTabId === targetTabId) {
      setDragOverTabId(null);
      return;
    }

    const currentTabs = [...terminalTabs];
    const draggedIndex = currentTabs.findIndex(t => t.id === draggedTabId);
    const targetIndex = currentTabs.findIndex(t => t.id === targetTabId);
    
    if (draggedIndex === -1 || targetIndex === -1) {
      setDragOverTabId(null);
      return;
    }

    const [removed] = currentTabs.splice(draggedIndex, 1);
    currentTabs.splice(targetIndex, 0, removed);
    
    terminalReorderTabs(currentTabs);
    setDragOverTabId(null);
  }, [terminalTabs, terminalReorderTabs]);

  const terminalMenuItems: TerminalMenuItem[] = [
    { id: "copy", label: t.terminalCopy, action: handleCopy },
    { id: "paste", label: t.terminalPaste, action: handlePaste },
    { id: "clear", label: t.terminalClear, action: handleClear },
    { id: "sep-1", separator: true },
    { id: "kill", label: t.terminalKillProcess, action: handleKill }
  ];

  const shellMenuItems: TerminalShellMenuItem[] = [
    { id: "new-terminal", label: t.menuNewTerminal, action: () => handleCreateTab(currentProfile) },
    { id: "sep-1", separator: true },
    { id: "powershell", label: "PowerShell", profile: "powershell", action: () => updateProfile("powershell") },
    { id: "bash", label: "Bash", profile: "bash", action: () => updateProfile("bash") },
    { id: "cmd", label: "CMD", profile: "cmd", action: () => updateProfile("cmd") }
  ];

  const shellTypeItems = useMemo(
    () => shellMenuItems.filter((item) => "profile" in item) as Array<
      TerminalShellMenuItem & { label: string; profile: TerminalProfile }
    >,
    [shellMenuItems]
  );

  const handleXtermData = useCallback((data: string) => {
    if (activeTab?.sessionId) {
      window.digitalLife.pty.input(activeTab.sessionId, data);
    }
  }, [activeTab?.sessionId]);

  const handleXtermResize = useCallback((cols: number, rows: number) => {
    if (activeTab?.sessionId) {
      window.digitalLife.pty.resize(activeTab.sessionId, cols, rows);
    }
  }, [activeTab?.sessionId]);

  useEffect(() => {
    const unsub = window.digitalLife.subscribePtyOutput((event) => {
      const outputs = sessionOutputsRef.current;
      const previous = outputs.get(event.sessionId) ?? "";
      outputs.set(event.sessionId, previous + event.data);
      if (event.sessionId === activeTab?.sessionId) {
        xtermRef.current?.write(event.data);
      }
    });
    return () => unsub();
  }, [activeTab?.sessionId]);

  const shellButtonGroup = (
    <div ref={shellMenuRef} className="adl-menu adl-file-context__menu">
      <div className={`adl-split-pill${shellMenuOpen ? " is-open" : ""}`}>
        <TooltipSimple content={t.menuNewTerminal} placement="top">
          <button
            type="button"
            className="adl-split-pill__main"
            onClick={() => handleCreateTab(currentProfile)}
            aria-label={t.menuNewTerminal}
          >
            <IconPlus size={12} decorative />
            <span>{currentProfileLabel}</span>
          </button>
        </TooltipSimple>
        <TooltipSimple content="类型选择" placement="top">
          <button
            type="button"
            className={`adl-split-pill__toggle${shellMenuOpen ? " is-open" : ""}`}
            onClick={() => setShellMenuOpen((value) => !value)}
            aria-label="类型选择"
            aria-haspopup="menu"
            aria-expanded={shellMenuOpen}
          >
            <IconChevronDown size={12} decorative />
          </button>
        </TooltipSimple>
      </div>
      {shellMenuOpen ? (
        <div className="adl-menu__dropdown adl-file-context__dropdown adl-terminal-shell-dropdown" role="menu">
          {shellMenuItems.map((item) =>
            "separator" in item ? (
              <div key={item.id} className="adl-menu__sep" role="separator" />
            ) : (
              <button
                key={item.id}
                type="button"
                role="menuitemradio"
                aria-checked={item.profile ? item.profile === currentProfile : false}
                className="adl-menu__item"
                onClick={() => {
                  item.action();
                  setShellMenuOpen(false);
                }}
              >
                <span>{item.label}</span>
              </button>
            )
          )}
        </div>
      ) : null}
    </div>
  );

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
            {shellButtonGroup}
          </div>
        </div>
        <div className="adl-tool-context__group adl-tool-context__group--files-actions">
          <div ref={terminalMenuRef} className="adl-menu adl-file-context__menu">
            <TooltipSimple content={t.terminalMoreActions} placement="top">
              <button
                type="button"
                className={`adl-tool-context__iconbtn${terminalMenuOpen ? " is-open" : ""}`}
                onClick={() => setTerminalMenuOpen((value) => !value)}
                aria-label={t.terminalMoreActions}
                aria-haspopup="menu"
                aria-expanded={terminalMenuOpen}
              >
                <IconMoreVertical size={14} decorative />
              </button>
            </TooltipSimple>
            {terminalMenuOpen ? (
              <div className="adl-menu__dropdown adl-file-context__dropdown" role="menu">
                {terminalMenuItems.map((item) =>
                  "separator" in item ? (
                    <div key={item.id} className="adl-menu__sep" role="separator" />
                  ) : (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      className="adl-menu__item"
                      disabled={item.disabled}
                      onClick={() => {
                        item.action?.();
                        setTerminalMenuOpen(false);
                      }}
                    >
                      <span>{item.label}</span>
                    </button>
                  )
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className={`adl-tool-surface adl-tool-surface--files${navigatorCollapsed ? " is-navigator-collapsed" : ""}`}
        style={{ "--adl-files-nav-width": `${terminalNavigatorWidth}px` } as React.CSSProperties}
      >
        <aside className="adl-tool-navigator" aria-label={t.toolTerminal}>
          <div className="adl-tool-navigator__context">
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
              <span className="adl-tool-navigator__context-title">{navigatorTitle}</span>
            </div>
            <span className="adl-tool-navigator__meta">{navigatorCount}</span>
          </div>
          <div className="adl-tool-navigator__context adl-tool-navigator__context--tabs">
            <TooltipSimple content={t.terminalSessions} placement="top">
              <button
                type="button"
                className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${navigatorMode === "sessions" ? " is-active" : ""}`}
                onClick={() => setNavigatorMode("sessions")}
                aria-label={t.terminalSessions}
              >
                <IconTerminal size={14} decorative />
              </button>
            </TooltipSimple>
            <TooltipSimple content={t.terminalRecentCommands} placement="top">
              <button
                type="button"
                className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${navigatorMode === "history" ? " is-active" : ""}`}
                onClick={() => setNavigatorMode("history")}
                aria-label={t.terminalRecentCommands}
              >
                <IconFileCode size={14} decorative />
              </button>
            </TooltipSimple>
            <div className="adl-tool-context__group--spacer" />
            {navigatorMode === "sessions" && terminalTabs.length > 0 && (
              <TooltipSimple content="关闭所有" placement="top">
                <button
                  type="button"
                  className="adl-tool-context__iconbtn"
                  onClick={handleCloseAllTabs}
                  aria-label="关闭所有"
                >
                  <IconTrash size={14} decorative />
                </button>
              </TooltipSimple>
            )}
          </div>

          {navigatorMode === "sessions" ? (
            <ul className="adl-tool-list">
              {terminalTabs.map((tab) => (
                <li
                  key={tab.id}
                  className={`adl-tool-list__item adl-tool-list__item--terminal-tab${isDragging && dragOverTabId === tab.id ? " is-drag-over" : ""}${tab.isPinned ? " is-pinned" : ""}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, tab.id, tab.isPinned)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, tab.id, tab.isPinned)}
                  onDrop={(e) => handleDrop(e, tab.id, tab.isPinned)}
                  onContextMenu={(e) => handleContextMenu(e, tab.id, tab.isPinned)}
                >
                  {editingTabId === tab.id ? (
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={handleEditSubmit}
                      onKeyDown={handleEditKeyDown}
                      className="adl-tool-list__item-editable-input"
                      style={{
                        flex: 1,
                        background: "var(--surface)",
                        border: "1px solid var(--accent)",
                        color: "var(--text-primary)",
                        fontSize: "13px",
                        padding: "2px 6px",
                        borderRadius: "var(--radius-sm)",
                        outline: "none",
                        minWidth: 0
                      }}
                    />
                  ) : (
                    <>
                      <button
                        type="button"
                        className={`adl-tool-list__item-btn${tab.id === terminalActiveTabId ? " is-active" : ""}`}
                        onClick={() => handleSelectTab(tab.id)}
                        onDoubleClick={() => handleDoubleClick(tab.id, tab.title)}
                      >
                        <span className="adl-tool-list__title">{tab.title}</span>
                        <small>{tab.status === "running" ? t.terminalLiveShell : tab.profile}</small>
                      </button>
                      <TooltipSimple content="关闭" placement="top">
                        <button
                          type="button"
                          className="adl-tool-list__item-close"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCloseTab(tab.id);
                          }}
                          aria-label="关闭"
                        >
                          <IconClose size={12} decorative />
                        </button>
                      </TooltipSimple>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : null}

          {navigatorMode === "history" ? (
            recentCommands.length ? (
              <ul className="adl-tool-list">
                {recentCommands.map((entry) => (
                  <li key={entry.id}>
                    <button type="button" className="adl-tool-list__item">
                      <span className="adl-tool-list__title">{entry.title}</span>
                      <small>{entry.label}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="adl-empty-hint">{t.terminalNoRecentCommands}</p>
            )
          ) : null}
          <div
            className="adl-tool-navigator__resize-handle"
            onPointerDown={handleNavigatorResizeStart}
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
                  onData={handleXtermData}
                  onResize={handleXtermResize}
                />
                {props.latestCommandRun?.status === "waiting-approval" && (
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
                {activeTab.status === "terminated" && !activeTab.sessionId && (
                  <div className="adl-terminal-error-note">
                    <span>⚠</span>
                    <span>{t.terminalShellNotFound}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="adl-terminal-empty">
                <div className="adl-terminal-empty__card">
                  <div className="adl-terminal-empty__header">
                    <IconTerminal size={16} decorative />
                    <span>终端面板</span>
                  </div>
                  <p className="adl-terminal-empty__text">
                    当前没有打开的终端会话<br />
                    选择一个 Shell 类型开始：
                  </p>
                  <div className="adl-terminal-empty__items">
                    {shellTypeItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="adl-terminal-empty__item"
                        onClick={() => handleCreateTab(item.profile)}
                      >
                        <ShellPrefix profile={item.profile} />
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                  <p className="adl-terminal-empty__footer">
                    点击直接创建 · 也可以在工具栏操作
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {contextMenu.open && createPortal((
        <div
          className="adl-sidebar-menu"
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 99999
          }}
          role="menu"
        >
          <button
            type="button"
            className="adl-sidebar-menu__item"
            onClick={handleTogglePin}
          >
            <span className="adl-sidebar-menu__icon">
              {contextMenu.isPinned ? (
                <IconPinOff size={16} decorative />
              ) : (
                <IconPin size={16} decorative />
              )}
            </span>
            <span>{contextMenu.isPinned ? "取消置顶" : "置顶"}</span>
          </button>
          <button
            type="button"
            className="adl-sidebar-menu__item"
            onClick={handleRenameFromMenu}
          >
            <span className="adl-sidebar-menu__icon">
              <IconEdit size={16} decorative />
            </span>
            <span>重命名</span>
          </button>
          <div className="adl-sidebar-menu__sep" role="separator" />
          <button
            type="button"
            className="adl-sidebar-menu__item is-danger"
            onClick={handleDeleteFromMenu}
          >
            <span className="adl-sidebar-menu__icon">
              <IconTrash size={16} decorative />
            </span>
            <span>删除</span>
          </button>
        </div>
      ), document.body)}
    </div>
  );
}
