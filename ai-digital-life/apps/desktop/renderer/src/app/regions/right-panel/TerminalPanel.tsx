import React, { useEffect, useMemo, useState } from "react";
import {
  IconClose,
  IconColumns,
  IconPanelLeft,
  IconPanelLeftClose,
  IconPlay,
  IconPlus,
  IconRefreshCw,
  IconStopCircle,
  IconTerminal
} from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";
import { useUiStore, type TerminalLayout, type TerminalProfile } from "../../ui-store";
import type { RightPanelViewProps } from "./types";

type TerminalNavigatorMode = "sessions" | "history" | "layout";

const LAYOUT_OPTIONS: TerminalLayout[] = ["single", "vertical", "horizontal"];

export function TerminalPanel(props: RightPanelViewProps) {
  const {
    t,
    commandBinary,
    commandArgs,
    latestCommandRun,
    terminalOutput,
    activeTerminalExecutionId,
    onCommandBinaryChange,
    onCommandArgsChange,
    onRunCommand,
    onRunCommandStream,
    onStopCommandStream
  } = props;
  const [navigatorMode, setNavigatorMode] = useState<TerminalNavigatorMode>("sessions");
  const navigatorCollapsed = useUiStore((state) => state.navigatorCollapsedByTool.terminal);
  const toggleNavigator = useUiStore((state) => state.toggleNavigator);
  const terminalTabs = useUiStore((state) => state.terminalTabs);
  const terminalActiveTabId = useUiStore((state) => state.terminalActiveTabId);
  const terminalLayout = useUiStore((state) => state.terminalLayout);
  const terminalCreateTab = useUiStore((state) => state.terminalCreateTab);
  const terminalSelectTab = useUiStore((state) => state.terminalSelectTab);
  const terminalCloseTab = useUiStore((state) => state.terminalCloseTab);
  const terminalUpdateActiveTab = useUiStore((state) => state.terminalUpdateActiveTab);
  const terminalSetLayout = useUiStore((state) => state.terminalSetLayout);
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
    if (activeTab?.live) {
      terminalUpdateActiveTab({ commandBinary, commandArgs });
    }
  }, [activeTab?.id, activeTab?.live, commandArgs, commandBinary, terminalUpdateActiveTab]);

  const currentBinary = activeTab?.live ? commandBinary : activeTab?.commandBinary ?? "npm";
  const currentArgs = activeTab?.live ? commandArgs : activeTab?.commandArgs ?? "run test";

  const updateBinary = (value: string) => {
    if (activeTab?.live) {
      onCommandBinaryChange(value);
    }
    terminalUpdateActiveTab({ commandBinary: value });
  };

  const updateArgs = (value: string) => {
    if (activeTab?.live) {
      onCommandArgsChange(value);
    }
    terminalUpdateActiveTab({ commandArgs: value });
  };

  const updateProfile = (profile: TerminalProfile) => {
    terminalUpdateActiveTab({
      profile,
      title: profile === "powershell" ? "PowerShell" : profile === "bash" ? "Bash" : "CMD"
    });
  };
  const layoutLabel = (layout: TerminalLayout) =>
    layout === "single"
      ? t.terminalLayoutSingle
      : layout === "vertical"
        ? t.terminalLayoutVertical
        : t.terminalLayoutHorizontal;

  return (
    <div className="adl-tool-panel adl-tool-panel--terminal">
      <div className="adl-tool-context">
        <div className="adl-tool-context__group adl-tool-context__group--grow">
          <select
            className="adl-select adl-select--sm"
            aria-label={t.terminalShellLabel}
            value={activeTab?.profile ?? "powershell"}
            onChange={(event) => updateProfile(event.target.value as TerminalProfile)}
          >
            <option value="powershell">PowerShell</option>
            <option value="bash">Bash</option>
            <option value="cmd">CMD</option>
          </select>
          <div className="adl-segmented">
            {LAYOUT_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={terminalLayout === option}
                onClick={() => terminalSetLayout(option)}
              >
                {layoutLabel(option)}
              </button>
            ))}
          </div>
        </div>
        <div className="adl-tool-context__group">
          <button type="button" className="adl-btn adl-btn--ghost adl-btn--xs" onClick={() => terminalCreateTab(activeTab?.profile)}>
            <IconPlus size={12} decorative />
            <span>{t.menuNewTerminal}</span>
          </button>
        </div>
      </div>

      <div className={`adl-tool-surface${navigatorCollapsed ? " is-navigator-collapsed" : ""}`}>
        <aside className="adl-tool-rail" aria-label={`${t.toolTerminal} rail`}>
          <TooltipSimple content={navigatorCollapsed ? t.panelToggleRight : t.panelToggleLeft} placement="right">
            <button type="button" className="adl-tool-rail__btn" onClick={() => toggleNavigator("terminal")}>
              {navigatorCollapsed ? <IconPanelLeft size={14} decorative /> : <IconPanelLeftClose size={14} decorative />}
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.terminalSessions} placement="right">
            <button
              type="button"
              className={`adl-tool-rail__btn${navigatorMode === "sessions" ? " is-active" : ""}`}
              onClick={() => setNavigatorMode("sessions")}
            >
              <IconTerminal size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.terminalRecentCommands} placement="right">
            <button
              type="button"
              className={`adl-tool-rail__btn${navigatorMode === "history" ? " is-active" : ""}`}
              onClick={() => setNavigatorMode("history")}
            >
              <IconRefreshCw size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.terminalLayout} placement="right">
            <button
              type="button"
              className={`adl-tool-rail__btn${navigatorMode === "layout" ? " is-active" : ""}`}
              onClick={() => setNavigatorMode("layout")}
            >
              <IconColumns size={14} decorative />
            </button>
          </TooltipSimple>
        </aside>

        <aside className="adl-tool-navigator" aria-label={t.toolTerminal}>
          <header className="adl-tool-navigator__header">
            <strong>
              {navigatorMode === "sessions"
                ? t.terminalSessions
                : navigatorMode === "history"
                  ? t.terminalRecentCommands
                  : t.terminalLayout}
            </strong>
            <span className="adl-tool-navigator__meta">
              {navigatorMode === "sessions"
                ? terminalTabs.length
                : navigatorMode === "history"
                  ? recentCommands.length
                  : LAYOUT_OPTIONS.length}
            </span>
          </header>

          {navigatorMode === "sessions" ? (
            <ul className="adl-tool-list">
              {terminalTabs.map((tab) => (
                <li key={tab.id}>
                  <button
                    type="button"
                    className={`adl-tool-list__item${tab.id === terminalActiveTabId ? " is-active" : ""}`}
                    onClick={() => terminalSelectTab(tab.id)}
                  >
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
                    <button
                      type="button"
                      className="adl-tool-list__item"
                      onClick={() => {
                        terminalSelectTab(entry.id);
                      }}
                    >
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

          {navigatorMode === "layout" ? (
            <div className="adl-startpage-list">
              {LAYOUT_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`adl-startpage-card${terminalLayout === option ? " is-active" : ""}`}
                  onClick={() => terminalSetLayout(option)}
                >
                  <strong>{layoutLabel(option)}</strong>
                  <span>{option === "single" ? t.terminalLiveShell : t.terminalPlaceholderShell}</span>
                </button>
              ))}
            </div>
          ) : null}
        </aside>

        <div className="adl-tool-primary">
          <div className="adl-tool-primary__tabs adl-tool-primary__tabs--terminal">
            {terminalTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={tab.id === terminalActiveTabId ? "is-active" : ""}
                onClick={() => terminalSelectTab(tab.id)}
              >
                <IconTerminal size={12} decorative />
                <span>{tab.title}</span>
                {terminalTabs.length > 1 ? (
                  <span
                    className="adl-tool-primary__tab-close"
                    onClick={(event) => {
                      event.stopPropagation();
                      terminalCloseTab(tab.id);
                    }}
                  >
                    <IconClose size={12} decorative />
                  </span>
                ) : null}
              </button>
            ))}
            <div className="adl-tool-primary__tabs-spacer" />
            <button type="button" className="adl-icon-btn adl-icon-btn--xs" onClick={() => terminalCreateTab(activeTab?.profile)}>
              <IconPlus size={12} decorative />
            </button>
          </div>

          <div className="adl-tool-primary__terminal-bar">
            <input
              value={currentBinary}
              onChange={(event) => updateBinary(event.target.value)}
              placeholder={t.commandBinary}
              aria-label={t.commandBinary}
            />
            <input
              value={currentArgs}
              onChange={(event) => updateArgs(event.target.value)}
              placeholder={t.commandArgs}
              aria-label={t.commandArgs}
            />
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--sm"
              onClick={onRunCommand}
              disabled={!activeTab?.live}
            >
              <IconPlay size={12} decorative />
              <span>{t.runCommand}</span>
            </button>
            <button
              type="button"
              className="adl-btn adl-btn--primary adl-btn--sm"
              onClick={onRunCommandStream}
              disabled={!activeTab?.live}
            >
              <IconTerminal size={12} decorative />
              <span>{t.runStreamCommand}</span>
            </button>
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--sm"
              disabled={!activeTab?.live || !activeTerminalExecutionId}
              onClick={onStopCommandStream}
            >
              <IconStopCircle size={12} decorative />
              <span>{t.stopStreamCommand}</span>
            </button>
          </div>

          <div className="adl-tool-primary__scroll adl-tool-primary__scroll--terminal">
            {activeTab?.live ? (
              <>
                {latestCommandRun ? (
                  <p className="adl-tool-hint">
                    {latestCommandRun.status === "waiting-approval" ? t.commandWaitingApproval : t.commandCompleted}
                  </p>
                ) : null}
                <pre className="adl-terminal-output" data-testid="terminal-output">
                  {terminalOutput || "—"}
                </pre>
              </>
            ) : (
              <div className="adl-terminal-placeholder">
                <span className="adl-chip adl-chip--warning">TODO</span>
                <p>{t.terminalPlaceholderNotice}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
