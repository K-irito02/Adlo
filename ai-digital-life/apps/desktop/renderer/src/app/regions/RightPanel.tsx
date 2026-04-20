import React, { useCallback, useEffect, useRef, useState } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import type {
  AppInfo,
  CommandRunResult,
  FilePatch,
  PatchApplicationResult,
  PatchSet,
  WorkspaceSearchHit
} from "@ai-digital-life/kernel";
import type { CopyDict } from "../copy";
import { MODEL_PROVIDER_IDS } from "../constants";
import type { EditorTabState } from "../editorTabs";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconFileText,
  IconFilePlus,
  IconFiles,
  IconFolder,
  IconFolderPlus,
  IconGitFork,
  IconGlobe,
  IconHome,
  IconPlay,
  IconPlus,
  IconRefreshCw,
  IconSearch,
  IconStar,
  IconStopCircle,
  IconTerminal
} from "../icons";
import type { MonacoEditorRef } from "../types";
import { useUiStore, type ToolId } from "../ui-store";

interface RightPanelProps {
  t: CopyDict;
  appInfo?: AppInfo;
  collapsed: boolean;
  // Files / editor
  editorTabs: EditorTabState[];
  selectedFilePath?: string;
  fileContent?: string;
  externalChangePath?: string;
  editorLanguage: string;
  diffSideBySide: boolean;
  filePatch?: FilePatch;
  diagnostics: Array<{
    id: string;
    source: string;
    message: string;
    path?: string;
    line?: number;
    severity: "error" | "warning" | "info";
  }>;
  editorHint?: string;
  searchQuery: string;
  searchResults: WorkspaceSearchHit[];
  standardEditorRef: React.MutableRefObject<MonacoEditorRef | null>;
  diffEditorRef: React.MutableRefObject<MonacoEditorRef | null>;
  onOpenFile: (relativePath: string) => void;
  onReloadExternal: () => void;
  onEditorChange: (value: string | undefined) => void;
  onEditorMount: (editor: MonacoEditorRef, monaco: unknown) => void;
  onDiffMount: (editor: MonacoEditorRef) => void;
  onSearch: (query: string) => void;
  onSearchChange: (query: string) => void;
  onSendSelection: () => void;
  onSetDiffLayout: (sideBySide: boolean) => void;
  // Changes
  activePatchSet?: PatchSet;
  latestPatchApplication?: PatchApplicationResult;
  onSetHunkDecision: (hunkId: string, decision: "pending" | "accepted" | "rejected") => void;
  onApplyPatchSet: () => void;
  onRollbackPatchSet: () => void;
  // Models panel
  modelHealth?: { providers: Array<{ providerId: string; healthy: boolean; detail: string }> } | undefined;
  onRefreshModelHealth: () => void;
  onUpdatePreference: (patch: unknown) => void;
  // Terminal
  commandBinary: string;
  commandArgs: string;
  latestCommandRun?: CommandRunResult;
  terminalOutput: string;
  activeTerminalExecutionId?: string;
  onCommandBinaryChange: (value: string) => void;
  onCommandArgsChange: (value: string) => void;
  onRunCommand: () => void;
  onRunCommandStream: () => void;
  onStopCommandStream: () => void;
}

function ToolSwitcher({
  t,
  activeTool,
  onSelect
}: {
  t: CopyDict;
  activeTool: ToolId;
  onSelect: (tool: ToolId) => void;
}) {
  const tabs: Array<{ id: ToolId; label: string; icon: React.ReactNode; shortcut: string }> = [
    { id: "files", label: t.toolFiles, icon: <IconFiles size={14} decorative />, shortcut: "Ctrl+Shift+E" },
    { id: "changes", label: t.toolChanges, icon: <IconGitFork size={14} decorative />, shortcut: "Ctrl+Shift+G" },
    { id: "browser", label: t.toolBrowser, icon: <IconGlobe size={14} decorative />, shortcut: "Ctrl+Shift+B" },
    { id: "terminal", label: t.toolTerminal, icon: <IconTerminal size={14} decorative />, shortcut: "Ctrl+Shift+`" }
  ];

  return (
    <div className="adl-toolswitcher" role="tablist" aria-label="Tool switcher">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTool === tab.id}
          className={`adl-toolswitcher__tab${activeTool === tab.id ? " is-active" : ""}`}
          onClick={() => onSelect(tab.id)}
          title={`${tab.label} · ${tab.shortcut}`}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

function FilesTool(props: RightPanelProps) {
  const {
    t,
    editorTabs,
    selectedFilePath,
    fileContent,
    externalChangePath,
    editorLanguage,
    diffSideBySide,
    filePatch,
    diagnostics,
    editorHint,
    searchQuery,
    searchResults,
    standardEditorRef,
    diffEditorRef,
    onOpenFile,
    onReloadExternal,
    onEditorChange,
    onEditorMount,
    onDiffMount,
    onSearch,
    onSearchChange,
    onSendSelection,
    onSetDiffLayout
  } = props;
  const [query, setQuery] = useState(searchQuery ?? "");

  return (
    <div className="adl-tool-body adl-tool-body--files">
      <aside className="adl-tool-sidebar">
        <div className="adl-tool-sidebar__search">
          <IconSearch size={12} decorative />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              onSearchChange(event.target.value);
            }}
            placeholder={t.searchPlaceholder}
            aria-label={t.search}
          />
          <button
            type="button"
            className="adl-icon-btn adl-icon-btn--xs"
            onClick={() => onSearch(query)}
            aria-label={t.searchAction}
          >
            <IconSearch size={12} decorative />
          </button>
        </div>
        <div className="adl-tool-sidebar__actions">
          <button type="button" className="adl-icon-btn adl-icon-btn--xs" title={t.fileNewFile} aria-label={t.fileNewFile}>
            <IconFilePlus size={12} decorative />
          </button>
          <button type="button" className="adl-icon-btn adl-icon-btn--xs" title={t.fileNewFolder} aria-label={t.fileNewFolder}>
            <IconFolderPlus size={12} decorative />
          </button>
          <button type="button" className="adl-icon-btn adl-icon-btn--xs" title={t.fileRefresh} aria-label={t.fileRefresh}>
            <IconRefreshCw size={12} decorative />
          </button>
        </div>
        <ul className="adl-tool-sidebar__list">
          {searchResults.length === 0 && editorTabs.length === 0 ? (
            <li className="adl-empty-hint adl-empty-hint--nested">{t.searchPlaceholder}</li>
          ) : null}
          {editorTabs.map((tab) => (
            <li key={tab.id}>
              <button
                type="button"
                className={tab.path === selectedFilePath ? "is-active" : ""}
                onClick={() => onOpenFile(tab.path)}
              >
                <IconFileText size={12} decorative />
                <span>{tab.title}</span>
              </button>
            </li>
          ))}
          {searchResults.map((result) => (
            <li key={`${result.path}:${result.line}`}>
              <button type="button" onClick={() => onOpenFile(result.path)}>
                <IconFileText size={12} decorative />
                <span>{result.path}</span>
                <small>{result.preview}</small>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="adl-tool-main">
        <div className="adl-tool-main__tabs" role="tablist" aria-label={t.filePreview}>
          {editorTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tab.path === selectedFilePath}
              className={tab.path === selectedFilePath ? "is-active" : ""}
              onClick={() => onOpenFile(tab.path)}
            >
              <IconFileText size={12} decorative />
              <span>{tab.title}</span>
            </button>
          ))}
          <div className="adl-tool-main__tabs-spacer" />
          <button
            type="button"
            className="adl-btn adl-btn--ghost adl-btn--xs"
            onClick={onSendSelection}
            disabled={!selectedFilePath}
          >
            {t.sendSelection}
          </button>
        </div>

        {externalChangePath === selectedFilePath ? (
          <div className="adl-banner adl-banner--warning" role="alert">
            <IconAlertTriangle size={14} decorative />
            <div>
              <strong>{t.externalChange}</strong>
              <span>{t.externalFileChanged}</span>
            </div>
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--sm"
              onClick={onReloadExternal}
            >
              {t.reloadFile}
            </button>
          </div>
        ) : null}

        {editorHint ? <p className="adl-tool-hint">{editorHint}</p> : null}

        <div className="adl-tool-editor" data-testid="editor-shell">
          {filePatch && filePatch.relativePath === selectedFilePath ? (
            <>
              <div className="adl-diff-toolbar" role="group" aria-label={t.diffLayoutLabel}>
                <span className="adl-diff-toolbar__label">{t.diffLayoutLabel}</span>
                <div className="adl-segmented">
                  <button
                    type="button"
                    aria-pressed={!diffSideBySide}
                    onClick={() => onSetDiffLayout(false)}
                  >
                    {t.diffLayoutInline}
                  </button>
                  <button
                    type="button"
                    aria-pressed={diffSideBySide}
                    onClick={() => onSetDiffLayout(true)}
                  >
                    {t.diffLayoutSideBySide}
                  </button>
                </div>
              </div>
              <DiffEditor
                language={editorLanguage}
                original={filePatch.beforeContent}
                modified={filePatch.afterContent}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  renderSideBySide: diffSideBySide,
                  scrollBeyondLastLine: false
                }}
                onMount={(editor) => onDiffMount(editor as unknown as MonacoEditorRef)}
              />
            </>
          ) : (
            <Editor
              language={editorLanguage}
              value={fileContent ?? ""}
              options={{
                readOnly: false,
                minimap: { enabled: false },
                scrollBeyondLastLine: false
              }}
              onChange={(value) => onEditorChange(value)}
              onMount={(editor, monaco) =>
                onEditorMount(editor as unknown as MonacoEditorRef, monaco)
              }
            />
          )}
        </div>

        {diagnostics.length ? (
          <div className="adl-tool-diagnostics">
            <h5>{t.diagnostics}</h5>
            <ul>
              {diagnostics.map((diagnostic) => (
                <li key={diagnostic.id}>
                  <strong>{diagnostic.source}</strong>
                  <span>{diagnostic.message}</span>
                  <span>
                    {diagnostic.path ?? selectedFilePath}
                    {diagnostic.line ? `:${diagnostic.line}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ChangesTool(props: RightPanelProps) {
  const {
    t,
    activePatchSet,
    latestPatchApplication,
    onSetHunkDecision,
    onApplyPatchSet,
    onRollbackPatchSet,
    modelHealth,
    onRefreshModelHealth,
    onUpdatePreference,
    appInfo
  } = props;

  const validation = latestPatchApplication?.validation;
  const patchFile = activePatchSet?.filePatches[0];

  return (
    <div className="adl-tool-body adl-tool-body--changes">
      <aside className="adl-tool-sidebar">
        <div className="adl-tool-sidebar__actions adl-tool-sidebar__actions--stack">
          <button type="button" className="adl-btn adl-btn--ghost adl-btn--sm">
            {t.changesStageAll}
          </button>
          <button type="button" className="adl-btn adl-btn--primary adl-btn--sm">
            {t.changesCommit}
          </button>
          <button type="button" className="adl-btn adl-btn--ghost adl-btn--sm">
            {t.changesPush}
          </button>
          <button type="button" className="adl-btn adl-btn--ghost adl-btn--sm">
            {t.changesPull}
          </button>
        </div>
      </aside>

      <div className="adl-tool-main">
        <div className="adl-tool-main__tabs">
          <h3 className="adl-tool-main__title">{t.patchPreview}</h3>
          {activePatchSet ? (
            <span className="adl-chip adl-chip--info">{activePatchSet.status}</span>
          ) : null}
          <div className="adl-tool-main__tabs-spacer" />
          <button
            type="button"
            className="adl-btn adl-btn--ghost adl-btn--sm"
            onClick={onRefreshModelHealth}
            aria-label={t.refreshModelHealth}
          >
            <IconRefreshCw size={12} decorative />
          </button>
        </div>

        <div className="adl-tool-main__scroll">
          {validation ? (
            <div className="adl-banner adl-banner--info">
              <strong>{validation.status}</strong>
              <span>{validation.summary}</span>
              {latestPatchApplication?.rolledBack ? <span className="adl-chip adl-chip--warning">rolled back</span> : null}
              {latestPatchApplication?.patchSet.status === "applied" ? <span className="adl-chip adl-chip--success">applied</span> : null}
            </div>
          ) : null}

          {patchFile ? (
            <article className="adl-patch-card">
              <header>
                <IconFileText size={14} decorative />
                <span>{patchFile.relativePath}</span>
                <span className="adl-chip adl-chip--info">
                  +{patchFile.afterContent.split("\n").length} -{patchFile.beforeContent.split("\n").length}
                </span>
              </header>
              {patchFile.hunks.map((hunk) => (
                <div key={hunk.id} className="adl-hunk">
                  <p>{hunk.preview}</p>
                  <pre>{hunk.afterText}</pre>
                  <div className="adl-hunk__actions">
                    <button
                      type="button"
                      className="adl-btn adl-btn--primary adl-btn--sm"
                      onClick={() => onSetHunkDecision(hunk.id, "accepted")}
                    >
                      {t.accept}
                    </button>
                    <button
                      type="button"
                      className="adl-btn adl-btn--ghost adl-btn--sm"
                      onClick={() => onSetHunkDecision(hunk.id, "rejected")}
                    >
                      {t.reject}
                    </button>
                  </div>
                </div>
              ))}
              <div className="adl-patch-card__footer">
                <button
                  data-testid="patch-apply"
                  type="button"
                  className="adl-btn adl-btn--primary"
                  onClick={onApplyPatchSet}
                >
                  {t.applyPatch}
                </button>
                <button
                  type="button"
                  className="adl-btn adl-btn--ghost"
                  onClick={onRollbackPatchSet}
                >
                  {t.rollbackPatch}
                </button>
              </div>
            </article>
          ) : (
            <p className="adl-empty-hint">{t.noPatch}</p>
          )}

          {/* Model health + settings card retained here to preserve test
              assertions (.adl-run-card / 模型状态 heading). */}
          <article className="adl-run-card">
            <header>
              <h3>{t.models}</h3>
              <button
                type="button"
                className="adl-btn adl-btn--ghost adl-btn--xs"
                onClick={onRefreshModelHealth}
              >
                <IconRefreshCw size={12} decorative />
              </button>
            </header>
            {modelHealth?.providers.length ? (
              <ul className="adl-run-card__list">
                {modelHealth.providers.map((provider) => (
                  <li key={provider.providerId}>
                    <strong>{provider.providerId}</strong>
                    <span className={`adl-chip adl-chip--${provider.healthy ? "success" : "warning"}`}>
                      {provider.healthy ? "healthy" : "degraded"}
                    </span>
                    <span>{provider.detail}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="adl-empty-hint">{t.modelUnavailable}</p>
            )}
            <h4>{t.modelSettings}</h4>
            <div className="adl-run-card__settings">
              {MODEL_PROVIDER_IDS.map((providerId) => {
                const preference = appInfo?.config.modelPreferences.providers[providerId];
                if (!preference) return null;
                return (
                  <section key={providerId}>
                    <strong>{providerId}</strong>
                    <label>
                      <span>{t.providerEnabled}</span>
                      <input
                        type="checkbox"
                        checked={preference.enabled}
                        onChange={(event) =>
                          onUpdatePreference({
                            modelPreferences: { [providerId]: { enabled: event.target.checked } }
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>{t.providerPriority}</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={preference.priority}
                        onChange={(event) =>
                          onUpdatePreference({
                            modelPreferences: { [providerId]: { priority: Number(event.target.value) } }
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>{t.providerModelId}</span>
                      <input
                        type="text"
                        value={preference.modelId}
                        onChange={(event) =>
                          onUpdatePreference({
                            modelPreferences: { [providerId]: { modelId: event.target.value } }
                          })
                        }
                      />
                    </label>
                  </section>
                );
              })}
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}

function BrowserTool({ t }: { t: CopyDict }) {
  return (
    <div className="adl-tool-body adl-tool-body--browser">
      <aside className="adl-tool-sidebar">
        <div className="adl-tool-sidebar__actions">
          <button type="button" className="adl-icon-btn adl-icon-btn--xs" title={t.menuOpenFolder}>
            <IconArrowLeft size={12} decorative />
          </button>
          <button type="button" className="adl-icon-btn adl-icon-btn--xs">
            <IconArrowRight size={12} decorative />
          </button>
          <button type="button" className="adl-icon-btn adl-icon-btn--xs">
            <IconRefreshCw size={12} decorative />
          </button>
          <button type="button" className="adl-icon-btn adl-icon-btn--xs">
            <IconHome size={12} decorative />
          </button>
          <button type="button" className="adl-icon-btn adl-icon-btn--xs">
            <IconStar size={12} decorative />
          </button>
        </div>
      </aside>
      <div className="adl-tool-main">
        <div className="adl-tool-main__tabs">
          <div className="adl-browser-address">
            <IconGlobe size={12} decorative />
            <input type="search" placeholder={t.browserAddress} />
          </div>
        </div>
        <div className="adl-tool-main__scroll adl-tool-main__scroll--centered">
          <p className="adl-empty-hint">{t.browserEmpty}</p>
        </div>
      </div>
    </div>
  );
}

function TerminalTool(props: RightPanelProps) {
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
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = endRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth" });
    }
  }, [terminalOutput]);

  return (
    <div className="adl-tool-body adl-tool-body--terminal">
      <aside className="adl-tool-sidebar">
        <div className="adl-tool-sidebar__actions adl-tool-sidebar__actions--stack">
          <button type="button" className="adl-btn adl-btn--ghost adl-btn--sm">
            <IconPlus size={12} decorative />
            <span>{t.menuNewTerminal}</span>
          </button>
          <select className="adl-select adl-select--sm" aria-label="Shell">
            <option value="powershell">PowerShell</option>
            <option value="bash">Bash</option>
            <option value="cmd">CMD</option>
          </select>
        </div>
      </aside>
      <div className="adl-tool-main">
        <div className="adl-tool-main__tabs">
          <div className="adl-terminal-runner">
            <input
              value={commandBinary}
              onChange={(event) => onCommandBinaryChange(event.target.value)}
              placeholder={t.commandBinary}
              aria-label={t.commandBinary}
            />
            <input
              value={commandArgs}
              onChange={(event) => onCommandArgsChange(event.target.value)}
              placeholder={t.commandArgs}
              aria-label={t.commandArgs}
            />
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--sm"
              onClick={onRunCommand}
            >
              <IconPlay size={12} decorative />
              <span>{t.runCommand}</span>
            </button>
            <button
              type="button"
              className="adl-btn adl-btn--primary adl-btn--sm"
              onClick={onRunCommandStream}
            >
              <IconTerminal size={12} decorative />
              <span>{t.runStreamCommand}</span>
            </button>
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--sm"
              disabled={!activeTerminalExecutionId}
              onClick={onStopCommandStream}
            >
              <IconStopCircle size={12} decorative />
              <span>{t.stopStreamCommand}</span>
            </button>
          </div>
        </div>
        <div className="adl-tool-main__scroll adl-tool-main__scroll--terminal">
          {latestCommandRun ? (
            <p className="adl-tool-hint">
              {latestCommandRun.status === "waiting-approval"
                ? t.commandWaitingApproval
                : t.commandCompleted}
            </p>
          ) : null}
          <pre className="adl-terminal-output" data-testid="terminal-output">
            {terminalOutput || "—"}
          </pre>
          <div ref={endRef} />
        </div>
      </div>
    </div>
  );
}

export function RightPanel(props: RightPanelProps) {
  const { t, collapsed } = props;
  const { activeTool, setActiveTool } = useUiStore();

  if (collapsed) {
    return (
      <aside className="adl-rightpanel adl-rightpanel--collapsed" aria-hidden="true" />
    );
  }

  return (
    <aside className="adl-rightpanel" aria-label="Workspace tool panel">
      <ToolSwitcher t={t} activeTool={activeTool} onSelect={setActiveTool} />
      <div className={`adl-rightpanel__tool${activeTool === "files" ? " is-active" : ""}`} hidden={activeTool !== "files"}>
        <FilesTool {...props} />
      </div>
      <div className={`adl-rightpanel__tool${activeTool === "changes" ? " is-active" : ""}`} hidden={activeTool !== "changes"}>
        <ChangesTool {...props} />
      </div>
      <div className={`adl-rightpanel__tool${activeTool === "browser" ? " is-active" : ""}`} hidden={activeTool !== "browser"}>
        <BrowserTool t={t} />
      </div>
      <div className={`adl-rightpanel__tool${activeTool === "terminal" ? " is-active" : ""}`} hidden={activeTool !== "terminal"}>
        <TerminalTool {...props} />
      </div>
    </aside>
  );
}
