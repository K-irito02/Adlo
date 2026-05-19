import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconChevronDown,
  IconClose,
  IconFileCode,
  IconMoreVertical,
  IconPanelLeftClose,
  IconPlus,
  IconTerminal,
  IconTrash
} from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";
import { XtermTerminal, type XtermTerminalHandle } from "../../components/terminal/XtermTerminal";
import { useUiStore, type TerminalProfile } from "../../ui-store";
import { useNavigatorResize } from "../../hooks/useNavigatorResize";
import type { RightPanelViewProps } from "./types";

type TerminalNavigatorMode = "sessions" | "history";
type TerminalMenuItem =
  | { id: string; separator: true }
  | { id: string; label: string; disabled?: boolean; action?: () => void };
type TerminalShellMenuItem =
  | { id: string; separator: true }
  | { id: string; label: string; profile?: TerminalProfile; action: () => void };

export function TerminalPanel(props: RightPanelViewProps) {
  const { t } = props;
  const [navigatorMode, setNavigatorMode] = useState<TerminalNavigatorMode>("sessions");
  const [terminalMenuOpen, setTerminalMenuOpen] = useState(false);
  const [shellMenuOpen, setShellMenuOpen] = useState(false);
  const navigatorCollapsed = useUiStore((state) => state.navigatorCollapsedByTool.terminal);
  const toggleNavigator = useUiStore((state) => state.toggleNavigator);
  const terminalNavigatorWidth = useUiStore((state) => state.terminalNavigatorWidth);
  const setTerminalNavigatorWidth = useUiStore((state) => state.setTerminalNavigatorWidth);
  const terminalTabs = useUiStore((state) => state.terminalTabs);
  const terminalActiveTabId = useUiStore((state) => state.terminalActiveTabId);
  const terminalCreateTab = useUiStore((state) => state.terminalCreateTab);
  const terminalSelectTab = useUiStore((state) => state.terminalSelectTab);
  const terminalCloseTab = useUiStore((state) => state.terminalCloseTab);
  const terminalUpdateActiveTab = useUiStore((state) => state.terminalUpdateActiveTab);
  const setActiveTool = useUiStore((state) => state.setActiveTool);

  const terminalMenuRef = useRef<HTMLDivElement | null>(null);
  const shellMenuRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<XtermTerminalHandle | null>(null);
  const sessionOutputsRef = useRef<Map<string, string>>(new Map());

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
    }
    xtermRef.current?.focus();
  }, [terminalCreateTab, terminalUpdateActiveTab, props.appInfo?.currentWorkspace?.rootPath]);

  useEffect(() => {
    if (!terminalMenuOpen && !shellMenuOpen) {
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
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [shellMenuOpen, terminalMenuOpen]);

  const { handlePointerDown: handleNavigatorResizeStart } = useNavigatorResize({
    onWidthCommit: setTerminalNavigatorWidth,
    minWidth: 180,
    maxWidth: 300
  });

  const navigatorTitle = navigatorMode === "sessions" ? t.terminalSessions : t.terminalRecentCommands;
  const navigatorCount = navigatorMode === "sessions" ? terminalTabs.length : recentCommands.length;

  const updateProfile = useCallback((profile: TerminalProfile) => {
    if (activeTab?.sessionId) {
      window.digitalLife.pty.kill(activeTab.sessionId);
    }
    terminalUpdateActiveTab({
      profile,
      title: profile === "powershell" ? "PowerShell" : profile === "bash" ? "Bash" : "CMD",
      sessionId: undefined,
      status: "idle"
    });
  }, [activeTab?.sessionId, terminalUpdateActiveTab]);

  const currentProfile = activeTab?.profile ?? "powershell";
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
    const tabs = useUiStore.getState().terminalTabs;
    const tab = tabs.find((t) => t.id === tabId);
    if (tab?.sessionId) {
      window.digitalLife.pty.kill(tab.sessionId);
      sessionOutputsRef.current.delete(tab.sessionId);
    }
    terminalCloseTab(tabId);
  }, [terminalCloseTab]);

  const handleCloseAllTabs = useCallback(() => {
    const tabs = useUiStore.getState().terminalTabs;
    tabs.forEach((tab) => {
      if (tab.sessionId) {
        window.digitalLife.pty.kill(tab.sessionId);
        sessionOutputsRef.current.delete(tab.sessionId);
      }
    });
    useUiStore.setState({ terminalTabs: [], terminalActiveTabId: "" });
  }, []);

  const handleSelectTab = useCallback((tabId: string) => {
    terminalSelectTab(tabId);
    const tabs = useUiStore.getState().terminalTabs;
    const tab = tabs.find((t) => t.id === tabId);
    if (tab?.sessionId) {
      const stored = sessionOutputsRef.current.get(tab.sessionId) ?? "";
      xtermRef.current?.clear();
      if (stored) {
        xtermRef.current?.write(stored);
      }
    }
  }, [terminalSelectTab]);

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

  const handleXtermData = useCallback((data: string) => {
    if (activeTab?.sessionId) {
      window.digitalLife.pty.input(activeTab.sessionId, data);
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
                <li key={tab.id} className="adl-tool-list__item adl-tool-list__item--terminal-tab">
                  <button type="button" className={`adl-tool-list__item-btn${tab.id === terminalActiveTabId ? " is-active" : ""}`} onClick={() => handleSelectTab(tab.id)}>
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
                />
                {props.latestCommandRun?.status === "waiting-approval" && (
                  <div className="adl-terminal-approval-hint">
                    <span>{t.terminalNeedsApproval}</span>
                    <button
                      type="button"
                      className="adl-btn adl-btn--primary adl-btn--xs"
                      onClick={() => setActiveTool("audit")}
                    >
                      {t.terminalGoToApproval}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="adl-tool-primary--terminal-empty">
                {shellButtonGroup}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
