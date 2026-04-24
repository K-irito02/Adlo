import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  IconChevronDown,
  IconFileCode,
  IconMoreVertical,
  IconPanelLeftClose,
  IconPlus,
  IconTerminal
} from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";
import { useUiStore, type TerminalLayout, type TerminalProfile } from "../../ui-store";
import type { RightPanelViewProps } from "./types";

type TerminalNavigatorMode = "sessions" | "history";
type TerminalMenuItem =
  | { id: string; separator: true }
  | { id: string; label: string; disabled?: boolean; action?: () => void };
type TerminalShellMenuItem =
  | { id: string; separator: true }
  | { id: string; label: string; profile?: TerminalProfile; action: () => void };

export function TerminalPanel(props: RightPanelViewProps) {
  const {
    t,
    commandBinary,
    commandArgs
  } = props;
  const [navigatorMode, setNavigatorMode] = useState<TerminalNavigatorMode>("sessions");
  const [terminalMenuOpen, setTerminalMenuOpen] = useState(false);
  const [shellMenuOpen, setShellMenuOpen] = useState(false);
  const navigatorCollapsed = useUiStore((state) => state.navigatorCollapsedByTool.terminal);
  const toggleNavigator = useUiStore((state) => state.toggleNavigator);
  const terminalNavigatorWidth = useUiStore((state) => state.terminalNavigatorWidth);
  const setTerminalNavigatorWidth = useUiStore((state) => state.setTerminalNavigatorWidth);
  const terminalTabs = useUiStore((state) => state.terminalTabs);
  const terminalActiveTabId = useUiStore((state) => state.terminalActiveTabId);
  const terminalLayout = useUiStore((state) => state.terminalLayout);
  const terminalCreateTab = useUiStore((state) => state.terminalCreateTab);
  const terminalSelectTab = useUiStore((state) => state.terminalSelectTab);
  const terminalUpdateActiveTab = useUiStore((state) => state.terminalUpdateActiveTab);
  const terminalSetLayout = useUiStore((state) => state.terminalSetLayout);
  const terminalMenuRef = useRef<HTMLDivElement | null>(null);
  const shellMenuRef = useRef<HTMLDivElement | null>(null);
  const activeTab = useMemo(
    () => terminalTabs.find((tab) => tab.id === terminalActiveTabId) ?? terminalTabs[0],
    [terminalActiveTabId, terminalTabs]
  );
  const recentCommands = useMemo(
    () =>
      terminalTabs
        .map((tab) => ({
          id: tab.id,
          label: `${tab.commandBinary} ${tab.commandArgs}`.trim(),
          title: tab.title
        }))
        .filter((entry) => entry.label),
    [terminalTabs]
  );

  useEffect(() => {
    if (terminalLayout !== "vertical") {
      terminalSetLayout("vertical" as TerminalLayout);
    }
  }, [terminalLayout, terminalSetLayout]);

  useEffect(() => {
    if (activeTab?.live) {
      terminalUpdateActiveTab({ commandBinary, commandArgs });
    }
  }, [activeTab?.id, activeTab?.live, commandArgs, commandBinary, terminalUpdateActiveTab]);

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

  const handleNavigatorResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = terminalNavigatorWidth;
    const body = document.body;
    body.classList.add("adl-is-resizing");

    const handleMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      setTerminalNavigatorWidth(startWidth + delta);
    };

    const handleUp = () => {
      body.classList.remove("adl-is-resizing");
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const navigatorTitle = navigatorMode === "sessions" ? t.terminalSessions : t.terminalRecentCommands;
  const navigatorCount = navigatorMode === "sessions" ? terminalTabs.length : recentCommands.length;

  const updateProfile = (profile: TerminalProfile) => {
    terminalUpdateActiveTab({
      profile,
      title: profile === "powershell" ? "PowerShell" : profile === "bash" ? "Bash" : "CMD"
    });
  };
  const currentProfile = activeTab?.profile ?? "powershell";
  const currentProfileLabel = currentProfile === "powershell" ? "PowerShell" : currentProfile === "bash" ? "Bash" : "CMD";
  const terminalMenuItems: TerminalMenuItem[] = [
    { id: "copy", label: t.terminalCopy, disabled: true },
    { id: "paste", label: t.terminalPaste, disabled: true },
    { id: "clear", label: t.terminalClear, disabled: true },
    { id: "sep-1", separator: true },
    { id: "kill", label: t.terminalKillProcess, disabled: true }
  ];
  const shellMenuItems: TerminalShellMenuItem[] = [
    { id: "new-terminal", label: t.menuNewTerminal, action: () => terminalCreateTab(currentProfile) },
    { id: "sep-1", separator: true },
    { id: "powershell", label: "PowerShell", profile: "powershell", action: () => updateProfile("powershell") },
    { id: "bash", label: "Bash", profile: "bash", action: () => updateProfile("bash") },
    { id: "cmd", label: "CMD", profile: "cmd", action: () => updateProfile("cmd") }
  ];

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
          <div ref={shellMenuRef} className="adl-menu adl-file-context__menu">
            <div className={`adl-split-pill${shellMenuOpen ? " is-open" : ""}`}>
              <TooltipSimple content={t.menuNewTerminal} placement="top">
                <button
                  type="button"
                  className="adl-split-pill__main"
                  onClick={() => terminalCreateTab(currentProfile)}
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
        </div>
        <div className="adl-tool-context__group adl-tool-context__group--files-actions">
          <TooltipSimple content={t.runStreamCommand} placement="top">
            <button type="button" className="adl-tool-context__iconbtn" disabled aria-label={t.runStreamCommand}>
              <IconTerminal size={14} decorative />
            </button>
          </TooltipSimple>
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
          </div>

          {navigatorMode === "sessions" ? (
            <ul className="adl-tool-list">
              {terminalTabs.map((tab) => (
                <li key={tab.id}>
                  <button type="button" className={`adl-tool-list__item${tab.id === terminalActiveTabId ? " is-active" : ""}`} onClick={() => terminalSelectTab(tab.id)}>
                    <span className="adl-tool-list__title">{tab.title}</span>
                    <small>{tab.live ? t.terminalLiveShell : t.terminalPlaceholderShell}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {navigatorMode === "history" ? (
            recentCommands.length ? (
              <ul className="adl-tool-list">
                {recentCommands.map((entry) => (
                  <li key={entry.id}>
                    <button type="button" className="adl-tool-list__item" onClick={() => terminalSelectTab(entry.id)}>
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

        <div className="adl-tool-primary adl-tool-primary--terminal-empty">
          <div className="adl-tool-primary__scroll adl-tool-primary__scroll--terminal">
            <div className="adl-terminal-canvas" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}
