import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import type { AppInfo, ApprovalRequestSummary } from "@ai-digital-life/kernel";
import { COLOR_SCHEME_META, type ColorScheme } from "../design-system";
import { copy, type Locale } from "./copy";
import { DIFF_LAYOUT_STORAGE_KEY, MODEL_PROVIDER_IDS } from "./constants";
import { MessageBlocks } from "./MessageBlocks";
import { buildSelectionPrompt } from "./selectionPrompt";
import { themeController } from "./theme";
import type { MonacoEditorRef } from "./types";
import { filterDiagnosticsForPath, findFirstDiagnostic, detectEditorLanguage } from "./workspacePaths";
import { mapPatchToEditorTab } from "./editorTabs";
import { useAppStore } from "./store";

function readDiffSideBySidePreference(): boolean {
  try {
    return window.localStorage.getItem(DIFF_LAYOUT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function App() {
  const {
    loading,
    error,
    appInfo,
    recentWorkspaces,
    sessions,
    activeSessionId,
    sessionDetails,
    activeRun,
    activePatchSet,
    latestPatchApplication,
    taskCenter,
    modelHealth,
    latestCommandRun,
    terminalOutput,
    activeTerminalExecutionId,
    openTabs,
    selectedFilePath,
    fileContent,
    fileLastModifiedAt,
    externalFileChange,
    outline,
    searchResults,
    bootstrap,
    openWorkspace,
    createSession,
    selectSession,
    sendMessage,
    cancelActiveStream,
    streamingAssistantText,
    streamingActiveRunId,
    openFile,
    searchFiles,
    setHunkDecision,
    applyPatchSet,
    rollbackPatchSet,
    refreshTaskCenter,
    decideApproval,
    markExternalFileChange,
    notifyEditorBufferDirty,
    runCommand,
    runCommandStream,
    stopCommandStream,
    refreshModelHealth,
    updatePreferences
  } = useAppStore();
  const [workspacePath, setWorkspacePath] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [commandBinary, setCommandBinary] = useState("npm");
  const [commandArgs, setCommandArgs] = useState("run test");
  const [editorHint, setEditorHint] = useState<string>();
  const standardEditorRef = useRef<MonacoEditorRef | null>(null);
  const diffEditorRef = useRef<MonacoEditorRef | null>(null);
  const terminalOutputEndRef = useRef<HTMLDivElement | null>(null);
  const editorDirtyTimerRef = useRef<number | undefined>(undefined);
  const [diffSideBySide, setDiffSideBySide] = useState(readDiffSideBySidePreference);
  const [colorScheme, setColorScheme] = useState<ColorScheme>(() => themeController.getState().colorScheme);
  const [isMaximized, setIsMaximized] = useState(false);

  const persistDiffLayout = useCallback((sideBySide: boolean) => {
    setDiffSideBySide(sideBySide);
    try {
      window.localStorage.setItem(DIFF_LAYOUT_STORAGE_KEY, sideBySide ? "1" : "0");
    } catch {
      /* ignore quota / private mode */
    }
  }, []);

  const handleStandardEditorChange = useCallback(
    (value: string | undefined) => {
      const pathAtEdit = selectedFilePath;
      if (!pathAtEdit) {
        return;
      }
      window.clearTimeout(editorDirtyTimerRef.current);
      editorDirtyTimerRef.current = window.setTimeout(() => {
        if (useAppStore.getState().selectedFilePath !== pathAtEdit) {
          return;
        }
        const baseline = useAppStore.getState().fileContent ?? "";
        const dirty = (value ?? "") !== baseline;
        notifyEditorBufferDirty(pathAtEdit, dirty);
      }, 300);
    },
    [notifyEditorBufferDirty, selectedFilePath]
  );

  useEffect(() => {
    return () => {
      window.clearTimeout(editorDirtyTimerRef.current);
    };
  }, [selectedFilePath]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    return themeController.subscribe((state) => {
      setColorScheme(state.colorScheme);
    });
  }, []);

  useEffect(() => {
    if (!appInfo) {
      return;
    }
    themeController.setTheme({
      mode: appInfo.config.themeMode,
      resolvedTheme: appInfo.config.resolvedTheme
    });
    themeController.hydrate();
  }, [appInfo]);

  useEffect(() => {
    if (!appInfo?.currentWorkspace) {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshTaskCenter();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [appInfo?.currentWorkspace, refreshTaskCenter]);

  useEffect(() => {
    return window.digitalLife.workspace.onFileChanged((event) => {
      markExternalFileChange(event);
    });
  }, [markExternalFileChange]);

  useEffect(() => {
    if (!terminalOutput) {
      return;
    }
    terminalOutputEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalOutput]);

  const locale = (appInfo?.config.language ?? "zh-CN") as Locale;
  const t = copy[locale];
  const activeDetail = activeSessionId ? sessionDetails[activeSessionId] : undefined;
  const filePatch = useMemo(() => {
    if (!activePatchSet || !selectedFilePath) {
      return activePatchSet?.filePatches[0];
    }
    return activePatchSet.filePatches.find((candidate) => candidate.relativePath === selectedFilePath) ?? activePatchSet.filePatches[0];
  }, [activePatchSet, selectedFilePath]);
  const validation = latestPatchApplication?.validation;
  const selectedDiagnostics = useMemo(
    () => filterDiagnosticsForPath(validation?.diagnostics ?? [], selectedFilePath),
    [selectedFilePath, validation?.diagnostics]
  );
  const activeDiagnostic = useMemo(() => findFirstDiagnostic(selectedDiagnostics), [selectedDiagnostics]);
  const editorLanguage = useMemo(
    () => detectEditorLanguage(selectedFilePath, filePatch?.language),
    [filePatch?.language, selectedFilePath]
  );
  const mergedTabs = useMemo(() => {
    const seen = new Set<string>();
    return [...openTabs, ...(activePatchSet?.filePatches.map(mapPatchToEditorTab) ?? [])].filter((tab) => {
      if (seen.has(tab.path)) {
        return false;
      }
      seen.add(tab.path);
      return true;
    });
  }, [activePatchSet?.filePatches, openTabs]);
  const modelHealthMap = useMemo(
    () => new Map((modelHealth?.providers ?? []).map((provider) => [provider.providerId, provider])),
    [modelHealth?.providers]
  );

  useEffect(() => {
    if (!activeDiagnostic?.line) {
      return;
    }
    const editor = diffEditorRef.current ?? standardEditorRef.current;
    editor?.revealLineInCenter(activeDiagnostic.line);
  }, [activeDiagnostic]);

  useEffect(() => {
    const editor = standardEditorRef.current as unknown as {
      getModel?: () => unknown;
    } | null;
    const model = editor?.getModel?.();
    const monacoEditor = (window as typeof window & {
      monaco?: {
        editor: {
          setModelMarkers: (model: unknown, owner: string, markers: unknown[]) => void;
          MarkerSeverity: {
            Error: number;
            Warning: number;
            Info: number;
          };
        };
      };
    }).monaco;

    if (!model || !monacoEditor) {
      return;
    }

    monacoEditor.editor.setModelMarkers(
      model,
      "validation",
      selectedDiagnostics.map((diagnostic) => ({
        startLineNumber: diagnostic.line ?? 1,
        startColumn: diagnostic.column ?? 1,
        endLineNumber: diagnostic.line ?? 1,
        endColumn: (diagnostic.column ?? 1) + 1,
        message: diagnostic.message,
        severity:
          diagnostic.severity === "error"
            ? monacoEditor.editor.MarkerSeverity.Error
            : diagnostic.severity === "warning"
              ? monacoEditor.editor.MarkerSeverity.Warning
              : monacoEditor.editor.MarkerSeverity.Info
      }))
    );
  }, [selectedDiagnostics]);

  const sendSelectedCode = async () => {
    const editor = diffEditorRef.current ?? standardEditorRef.current;
    const selection = editor?.getSelection();
    const model = editor?.getModel();
    if (!selection || !model || !selectedFilePath) {
      setEditorHint(t.noSelection);
      return;
    }

    const selectedText = model.getValueInRange(selection).trim();
    if (!selectedText) {
      setEditorHint(t.noSelection);
      return;
    }

    setEditorHint(undefined);
    await sendMessage(buildSelectionPrompt(locale, selectedFilePath, selectedText));
  };

  const handleColorSchemePick = (scheme: ColorScheme) => {
    themeController.setColorScheme(scheme);
  };

  const handleWindowMinimize = useCallback(() => {
    void window.digitalLife.window.minimize();
  }, []);

  const handleWindowMaximize = useCallback(async () => {
    await window.digitalLife.window.maximize();
    setIsMaximized(await window.digitalLife.window.isMaximized());
  }, []);

  const handleWindowClose = useCallback(() => {
    void window.digitalLife.window.close();
  }, []);

  useEffect(() => {
    const syncMaximized = async () => {
      setIsMaximized(await window.digitalLife.window.isMaximized());
    };
    void syncMaximized();
    const timer = setInterval(syncMaximized, 500);
    return () => clearInterval(timer);
  }, []);

  if (loading) {
    const loadingCopy = copy[(appInfo?.config.language ?? "zh-CN") as Locale];
    return (
      <main className="adl-ide" aria-busy="true">
        <div className="adl-ide-loading">
          <p>{loadingCopy.loading}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="adl-ide">
      <header className="adl-ide-titlebar">
        <div className="adl-ide-titlebar-brand">
          <span className="pill pill--accent">{t.phaseLabel}</span>
          <span>{t.landingTitle}</span>
        </div>
        <div className="adl-ide-titlebar-actions">
          <div className="color-scheme" role="list">
            {COLOR_SCHEME_META.map((meta) => (
              <button
                key={meta.id}
                type="button"
                className={`color-scheme__btn${meta.id === colorScheme ? " color-scheme__btn--active" : ""}`}
                aria-label={locale === "zh-CN" ? meta.zhName : meta.enName}
                aria-pressed={meta.id === colorScheme}
                onClick={() => handleColorSchemePick(meta.id)}
              >
                <span className="color-scheme__swatch" style={{ background: meta.accentLight }} />
              </button>
            ))}
          </div>
          <select
            className="select select--sm"
            style={{ width: "auto" }}
            value={appInfo?.config.language ?? "zh-CN"}
            onChange={(event) => void updatePreferences({ language: event.target.value as AppInfo["config"]["language"] })}
          >
            <option value="zh-CN">中文</option>
            <option value="en-US">EN</option>
          </select>
          <select
            className="select select--sm"
            style={{ width: "auto" }}
            value={appInfo?.config.themeMode ?? "system"}
            onChange={(event) => void updatePreferences({ themeMode: event.target.value as AppInfo["config"]["themeMode"] })}
          >
            <option value="system">Auto</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div className="adl-ide-titlebar-controls">
          <button
            type="button"
            className="adl-titlebar-control-btn"
            aria-label="Minimize"
            onClick={handleWindowMinimize}
          >
            <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor"><rect width="10" height="1"/></svg>
          </button>
          <button
            type="button"
            className="adl-titlebar-control-btn"
            aria-label={isMaximized ? "Restore" : "Maximize"}
            onClick={handleWindowMaximize}
          >
            {isMaximized ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
                <rect x="1" y="3.5" width="6.5" height="6.5" rx="0.5"/>
                <path d="M3.5 6.5V1.5C3.5 1 4 0.5 4.5 0.5H8.5C9 0.5 9.5 1 9.5 1.5V5.5C9.5 6 9 6.5 8.5 6.5H6.5"/>
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
                <rect x="0.6" y="0.6" width="8.8" height="8.8" rx="0.8"/>
              </svg>
            )}
          </button>
          <button
            type="button"
            className="adl-titlebar-control-btn adl-titlebar-control-btn--close"
            aria-label="Close"
            onClick={handleWindowClose}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M1 1L9 9M9 1L1 9"/>
            </svg>
          </button>
        </div>
      </header>

      {error ? (
        <div className="banner banner--error adl-flash" role="alert">
          {error}
        </div>
      ) : null}

      {!appInfo?.currentWorkspace ? (
        <div className="adl-ide-loading">
          <div className="empty-state empty-state--start">
            <p className="empty-state__title">{t.noWorkspace}</p>
            <div className="form-row adl-landing-form">
              <input
                className="input"
                value={workspacePath}
                onChange={(event) => setWorkspacePath(event.target.value)}
                placeholder={t.workspacePlaceholder}
              />
              <button className="btn" type="button" onClick={() => void openWorkspace(workspacePath)}>
                {t.openWorkspace}
              </button>
            </div>
            <ul className="adl-recent-list" style={{ marginTop: '1rem' }}>
              {recentWorkspaces.map((workspace) => (
                <li key={workspace.path}>
                  <button className="btn btn--secondary btn--block" type="button" onClick={() => void openWorkspace(workspace.path)}>
                    {workspace.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="adl-ide-body">
          <nav className="adl-ide-activity-bar">
            <div className="adl-ide-activity-item is-active" title="Explorer">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>
            </div>
            <div className="adl-ide-activity-item" title="Search">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
          </nav>

          <aside className="adl-ide-sidebar">
            <div className="adl-ide-sidebar-header">
              <span>Explorer</span>
            </div>
            <div className="adl-ide-sidebar-content">
              <div className="adl-ide-section">
                <div className="adl-ide-section-header">
                  <span>{t.sessions}</span>
                  <button className="btn btn--ghost btn--sm" style={{ padding: '2px 6px', height: 'auto', minHeight: 0 }} type="button" onClick={() => void createSession()}>
                    +
                  </button>
                </div>
                <div className="adl-ide-section-content" style={{ padding: 0 }}>
                  <ul className="adl-session-list">
                    {sessions.map((session) => (
                      <li key={session.id}>
                        <button
                          type="button"
                          className={session.id === activeSessionId ? "is-active" : ""}
                          onClick={() => void selectSession(session.id)}
                        >
                          <strong>{session.title}</strong>
                          <span>{new Date(session.updatedAt).toLocaleString(locale)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="adl-ide-section">
                <div className="adl-ide-section-header">
                  <span>{t.approvals}</span>
                </div>
                <div className="adl-ide-section-content">
                  <p className="adl-status">
                    {t.approvalPolicy}: {taskCenter?.policy.summary ?? "—"}
                  </p>
                  {taskCenter?.pendingApprovals.length ? (
                    <ul className="adl-approval-list">
                      {taskCenter.pendingApprovals.map((approval: ApprovalRequestSummary) => (
                        <li key={approval.id} className="adl-approval-card">
                          <strong>{approval.title}</strong>
                          <span>{approval.description}</span>
                          <span className="pill pill--warning">{approval.riskLevel}</span>
                          <div className="adl-hunk-actions">
                            <button className="btn btn--sm" type="button" onClick={() => void decideApproval(approval.id, "approved")}>
                              {t.approve}
                            </button>
                            <button className="btn btn--secondary btn--sm" type="button" onClick={() => void decideApproval(approval.id, "rejected")}>
                              {t.rejectApproval}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>{t.noApprovals}</p>
                  )}
                </div>
              </div>

              <div className="adl-ide-section">
                <div className="adl-ide-section-header">
                  <span>{t.models}</span>
                  <button className="btn btn--ghost btn--sm" style={{ padding: '2px 6px', height: 'auto', minHeight: 0 }} type="button" onClick={() => void refreshModelHealth()}>
                    ↻
                  </button>
                </div>
                <div className="adl-ide-section-content">
                  {modelHealth?.providers.length ? (
                    <ul className="adl-model-health-list">
                      {modelHealth.providers.map((provider) => (
                        <li key={provider.providerId} className="adl-model-health-item">
                          <strong>{provider.providerId}</strong>
                          <span className={`pill ${provider.healthy ? "pill--healthy" : "pill--degraded"}`}>
                            {provider.healthy ? "healthy" : "degraded"}
                          </span>
                          <span className="text-muted">{provider.detail}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>{t.modelUnavailable}</p>
                  )}
                  <div className="adl-model-settings">
                    <h4 style={{ fontSize: 'var(--text-xs)', marginTop: 'var(--space-2)' }}>{t.modelSettings}</h4>
                    {MODEL_PROVIDER_IDS.map((providerId) => {
                      const providerPreference = appInfo?.config.modelPreferences.providers[providerId];
                      if (!providerPreference) return null;
                      return (
                        <section key={providerId} className="adl-model-setting-card" style={{ marginTop: 'var(--space-2)' }}>
                          <strong>{providerId}</strong>
                          <label className="adl-setting-row">
                            <span>{t.providerEnabled}</span>
                            <input
                              type="checkbox"
                              checked={providerPreference.enabled}
                              onChange={(event) => void updatePreferences({ modelPreferences: { [providerId]: { enabled: event.target.checked } } })}
                            />
                          </label>
                          <label className="adl-setting-row">
                            <span>{t.providerPriority}</span>
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={providerPreference.priority}
                              onChange={(event) => void updatePreferences({ modelPreferences: { [providerId]: { priority: Number(event.target.value) } } })}
                            />
                          </label>
                          <label className="adl-setting-row">
                            <span>{t.providerModelId}</span>
                            <input
                              type="text"
                              value={providerPreference.modelId}
                              onChange={(event) => void updatePreferences({ modelPreferences: { [providerId]: { modelId: event.target.value } } })}
                            />
                          </label>
                        </section>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="adl-ide-section">
                <div className="adl-ide-section-header">
                  <span>{t.commandRunner}</span>
                </div>
                <div className="adl-ide-section-content">
                  <div className="adl-stack">
                    <input className="input" style={{ minHeight: '32px', padding: '4px 8px', fontSize: 'var(--text-xs)' }} value={commandBinary} onChange={(event) => setCommandBinary(event.target.value)} placeholder={t.commandBinary} />
                    <input className="input" style={{ minHeight: '32px', padding: '4px 8px', fontSize: 'var(--text-xs)' }} value={commandArgs} onChange={(event) => setCommandArgs(event.target.value)} placeholder={t.commandArgs} />
                  </div>
                  <div className="adl-inline-actions">
                    <button className="btn btn--secondary btn--sm" type="button" onClick={() => void runCommand(commandBinary, commandArgs)}>
                      {t.runCommand}
                    </button>
                    <button className="btn btn--sm" type="button" onClick={() => void runCommandStream(commandBinary, commandArgs)}>
                      {t.runStreamCommand}
                    </button>
                    <button className="btn btn--ghost btn--sm" type="button" disabled={!activeTerminalExecutionId} onClick={() => void stopCommandStream()}>
                      {t.stopStreamCommand}
                    </button>
                  </div>
                  {latestCommandRun ? (
                    <p className="adl-status">
                      {latestCommandRun.status === "waiting-approval" ? t.commandWaitingApproval : t.commandCompleted}
                    </p>
                  ) : null}
                  <div className="adl-terminal-panel">
                    <h4 className="adl-terminal-panel__title">{t.terminalOutput}</h4>
                    <pre className="adl-terminal-panel__output" data-testid="terminal-output">
                      {terminalOutput || "—"}
                    </pre>
                    <div ref={terminalOutputEndRef} />
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <section className="adl-ide-main">
            <div className="adl-ide-editor-header">
              <span>{t.conversation}</span>
            </div>
            <div className="adl-ide-editor-content">
              <div className="adl-message-stream">
                {activeDetail?.messages.length ? (
                  activeDetail.messages.map((messageItem) => (
                    <article key={messageItem.id} className={`adl-message adl-message--${messageItem.role}`}>
                      <header>
                        <strong>{messageItem.role}</strong>
                      </header>
                      <p>{messageItem.content}</p>
                      <MessageBlocks message={messageItem} />
                    </article>
                  ))
                ) : (
                  <p className="text-muted" style={{ textAlign: 'center', marginTop: '2rem' }}>{t.noMessages}</p>
                )}
                {streamingAssistantText ? (
                  <article className="adl-message adl-message--assistant adl-message--streaming">
                    <header>
                      <strong>assistant</strong>
                      <span className="text-muted"> streaming</span>
                    </header>
                    <p>{streamingAssistantText}</p>
                  </article>
                ) : null}
              </div>
              <div className="adl-composer">
                <textarea
                  className="adl-composer__input"
                  data-testid="composer-input"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="@packages/kernel/src/index.ts 添加阶段二说明"
                />
                <div className="adl-composer__actions">
                  {streamingActiveRunId ? (
                    <button className="btn btn--secondary" type="button" onClick={() => void cancelActiveStream()}>
                      {t.cancelGenerate}
                    </button>
                  ) : null}
                  <button
                    data-testid="composer-send"
                    className="btn"
                    type="button"
                    onClick={() => {
                      void sendMessage(message);
                      setMessage("");
                    }}
                  >
                    {t.send}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <aside className="adl-ide-panel-right">
            <div className="adl-ide-sidebar-header">
              <span>Details</span>
            </div>
            <div className="adl-ide-sidebar-content">
              <div className="adl-ide-section" style={{ flex: 1, minHeight: 0 }}>
                <div className="adl-ide-section-header">
                  <span>{t.filePreview}</span>
                  <button className="btn btn--ghost btn--sm" style={{ padding: '2px 6px', height: 'auto', minHeight: 0 }} type="button" onClick={() => void sendSelectedCode()}>
                    {t.sendSelection}
                  </button>
                </div>
                <div className="adl-ide-section-content" style={{ padding: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {externalFileChange?.path === selectedFilePath ? (
                    <div className="banner banner--warning adl-validation-banner" style={{ margin: 'var(--space-2)' }}>
                      <strong>{t.externalChange}</strong>
                      <span>{t.externalFileChanged}</span>
                      <button className="btn btn--sm" type="button" onClick={() => void openFile(selectedFilePath!)}>
                        {t.reloadFile}
                      </button>
                    </div>
                  ) : null}
                  
                  {mergedTabs.length ? (
                    <div className="adl-editor-tabs" role="tablist" aria-label={t.filePreview}>
                      {mergedTabs.map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={tab.path === selectedFilePath}
                          className={tab.path === selectedFilePath ? "is-active" : ""}
                          onClick={() => void openFile(tab.path)}
                        >
                          {tab.title}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  
                  {editorHint ? <p className="adl-status" style={{ padding: '0 var(--space-3)' }}>{editorHint}</p> : null}
                  
                  <div className="adl-editor-shell" data-testid="editor-shell">
                    {filePatch && filePatch.relativePath === selectedFilePath ? (
                      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div style={{ padding: 'var(--space-2) var(--space-3)' }}>
                          <div className="segmented adl-diff-layout-toggle" role="group" aria-label={t.diffLayoutLabel}>
                            <button
                              type="button"
                              className="segmented__btn"
                              aria-pressed={!diffSideBySide}
                              onClick={() => persistDiffLayout(false)}
                            >
                              {t.diffLayoutInline}
                            </button>
                            <button
                              type="button"
                              className="segmented__btn"
                              aria-pressed={diffSideBySide}
                              onClick={() => persistDiffLayout(true)}
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
                          onMount={(editor) => {
                            diffEditorRef.current = editor as unknown as MonacoEditorRef;
                          }}
                        />
                      </div>
                    ) : (
                      <Editor
                        language={editorLanguage}
                        value={fileContent ?? ""}
                        options={{
                          readOnly: false,
                          minimap: { enabled: false },
                          scrollBeyondLastLine: false
                        }}
                        onChange={(value) => handleStandardEditorChange(value)}
                        onMount={(editor, monaco) => {
                          standardEditorRef.current = editor as unknown as MonacoEditorRef;
                          (window as typeof window & { monaco?: typeof monaco }).monaco = monaco;
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="adl-ide-section">
                <div className="adl-ide-section-header">
                  <span>{t.patchPreview}</span>
                  {activePatchSet ? <span className="pill pill--info">{activePatchSet.status}</span> : null}
                </div>
                <div className="adl-ide-section-content">
                  {latestPatchApplication?.validation ? (
                    <div className="banner banner--neutral adl-validation-banner">
                      <strong>{latestPatchApplication.validation.status}</strong>
                      <span>{latestPatchApplication.validation.summary}</span>
                      {latestPatchApplication.rolledBack ? <span>rolled back</span> : null}
                    </div>
                  ) : null}
                  {filePatch ? (
                    <div className="adl-patch-card">
                      <button type="button" className="pill pill--accent adl-file-chip" onClick={() => void openFile(filePatch.relativePath)}>
                        {filePatch.relativePath}
                      </button>
                      {filePatch.hunks.map((hunk) => (
                        <div key={hunk.id} className="adl-hunk">
                          <p>{hunk.preview}</p>
                          <div className="adl-hunk-actions">
                            <button className="btn btn--sm" type="button" onClick={() => void setHunkDecision(activePatchSet!.id, hunk.id, "accepted")}>
                              {t.accept}
                            </button>
                            <button className="btn btn--secondary btn--sm" type="button" onClick={() => void setHunkDecision(activePatchSet!.id, hunk.id, "rejected")}>
                              {t.reject}
                            </button>
                          </div>
                          <pre>{hunk.afterText}</pre>
                        </div>
                      ))}
                      <div className="adl-inline-actions" style={{ marginTop: 'var(--space-2)' }}>
                        <button data-testid="patch-apply" className="btn" type="button" onClick={() => void applyPatchSet(activePatchSet!.id)}>
                          {t.applyPatch}
                        </button>
                        <button className="btn btn--secondary" type="button" onClick={() => void rollbackPatchSet(activePatchSet!.id)}>
                          {t.rollbackPatch}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>{t.noPatch}</p>
                  )}
                </div>
              </div>

              <div className="adl-ide-section">
                <div className="adl-ide-section-header">
                  <span>{t.search}</span>
                </div>
                <div className="adl-ide-section-content">
                  <div className="form-row adl-search-row">
                    <input className="input" style={{ minHeight: '32px', padding: '4px 8px', fontSize: 'var(--text-xs)' }} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.searchPlaceholder} />
                    <button className="btn btn--secondary btn--sm" type="button" onClick={() => void searchFiles(query)}>
                      {t.searchAction}
                    </button>
                  </div>
                  <ul className="adl-search-results">
                    {searchResults.map((result) => (
                      <li key={`${result.path}:${result.line}`}>
                        <button type="button" onClick={() => void openFile(result.path)}>
                          <strong>{result.path}</strong>
                          <span>{result.preview}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="adl-ide-section">
                <div className="adl-ide-section-header">
                  <span>{t.diagnostics}</span>
                </div>
                <div className="adl-ide-section-content">
                  {selectedDiagnostics.length ? (
                    <ul className="adl-diagnostic-list">
                      {selectedDiagnostics.map((diagnostic) => (
                        <li key={diagnostic.id}>
                          <button
                            type="button"
                            onClick={() => {
                              const editor = diffEditorRef.current ?? standardEditorRef.current;
                              if (diagnostic.line) {
                                editor?.revealLineInCenter(diagnostic.line);
                              }
                            }}
                          >
                            <strong>{diagnostic.source}</strong>
                            <span>{diagnostic.message}</span>
                            <span>
                              {diagnostic.path ?? selectedFilePath}
                              {diagnostic.line ? `:${diagnostic.line}` : ""}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>{t.noDiagnostics}</p>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      <footer className="adl-ide-statusbar" role="contentinfo">
        <div className="adl-ide-statusbar__item">
          <span className="text-muted" style={{ opacity: 0.7 }}>{t.workspaceLabel}</span> {appInfo?.currentWorkspace?.name}
        </div>
        <div className="adl-ide-statusbar__sep" aria-hidden="true" />
        <div className="adl-ide-statusbar__item text-muted" style={{ opacity: 0.7 }}>{t.statusReady}</div>
      </footer>
    </main>
  );
}
