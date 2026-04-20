import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import type { AppInfo, ApprovalRequestSummary } from "@ai-digital-life/kernel";
import { copy, type Locale } from "./copy";
import { DIFF_LAYOUT_STORAGE_KEY, MODEL_PROVIDER_IDS } from "./constants";
import { MessageBlocks } from "./MessageBlocks";
import { buildSelectionPrompt } from "./selectionPrompt";
import { themeController } from "./theme";
import type { MonacoEditorRef } from "./types";
import { filterDiagnosticsForPath, findFirstDiagnostic, detectEditorLanguage } from "./workspacePaths";
import { mapPatchToEditorTab } from "./editorTabs";
import { useAppStore } from "./store";

/* ------------------------------------------------------------------ */
/*  Modular layout components                                         */
/* ------------------------------------------------------------------ */

import { TitleBar } from "./components/TitleBar";
import { LeftSidebar } from "./components/LeftSidebar";
import { MainContent } from "./components/MainContent";
import { RightPanel } from "./components/RightPanel";
import { StatusBar } from "./components/StatusBar";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function readDiffSideBySidePreference(): boolean {
  try {
    return window.localStorage.getItem(DIFF_LAYOUT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  App component                                                      */
/* ------------------------------------------------------------------ */

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
    updatePreferences,
    /* ---------- New UI layout state ---------- */
    leftSidebarVisible,
    rightPanelVisible,
    activeRightTool,
    currentModel,
    composerMessage,
    setLeftSidebarVisible,
    setRightPanelVisible,
    setActiveRightTool,
    setCurrentModel,
    setComposerMessage,
    toggleLeftSidebar,
    toggleRightSidebar,
  } = useAppStore();

  /* ---- Local component state (unchanged) ---- */
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
  const [isMaximized, setIsMaximized] = useState(false);

  /* ---- Callbacks (unchanged) ---- */
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

  /* ---- Effects (all unchanged) ---- */
  useEffect(() => {
    return () => {
      window.clearTimeout(editorDirtyTimerRef.current);
    };
  }, [selectedFilePath]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

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

  /* ---- Derived values (unchanged) ---- */
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

  /* ---- Editor effects (unchanged) ---- */
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

  /* ---- Handlers (unchanged) ---- */
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

  /* ---- Loading state (unchanged) ---- */
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

  /* ================================================================== */
  /*  MAIN RENDER - Modular component architecture                      */
  /* ================================================================== */

  return (
    <main className="adl-ide">
      {/* ---------------------------------------------------------------- */}
      {/*  Region 1-4: TitleBar                                            */}
      {/* ---------------------------------------------------------------- */}
      <TitleBar
        phaseLabel={t.phaseLabel}
        appName={t.landingTitle}
        isMaximized={isMaximized}
        leftSidebarVisible={leftSidebarVisible}
        rightPanelVisible={rightPanelVisible}
        onSettingsClick={() => {}}
        onMinimize={handleWindowMinimize}
        onMaximize={handleWindowMaximize}
        onClose={handleWindowClose}
        onToggleLeftSidebar={() => toggleLeftSidebar()}
        onToggleRightSidebar={() => toggleRightSidebar()}
        onToggleAllPanels={() => {
          toggleLeftSidebar();
          toggleRightSidebar();
        }}
      />

      {/* Error banner if any */}
      {error ? (
        <div className="banner banner--error adl-flash" role="alert">
          {error}
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/*  Main body - flex row                                           */}
      {/* ---------------------------------------------------------------- */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>

        {/* ---------------------------------------------------------------- */}
        {/*  Region 5-7: Left Sidebar (conditionally visible)                */}
        {/* ---------------------------------------------------------------- */}
        {leftSidebarVisible && (
          <LeftSidebar
            /* QuickActions */
            activeAction={undefined}
            mcpStatus="none"
            onSkillsClick={() => {}}
            onMcpClick={() => {}}
            onNewWorkspace={() => {}}
            /* SessionManagement */
            sessions={sessions.map((s) => ({
              id: s.id,
              title: s.title,
              updatedAt: String(s.updatedAt),
            }))}
            activeSessionId={activeSessionId}
            workspaces={appInfo?.currentWorkspace
              ? [{ id: appInfo.currentWorkspace.path, name: appInfo.currentWorkspace.name, isActive: true }]
              : []
            }
            onCreateSession={() => void createSession()}
            onSelectSession={(id) => void selectSession(id)}
            onSelectWorkspace={(id) => void openWorkspace(id)}
            /* EnvironmentControls */
            currentLanguage={appInfo?.config.language ?? "zh-CN"}
            currentTheme={(appInfo?.config.themeMode ?? "system") as "light" | "dark" | "system"}
            onChangeLanguage={(lang) => void updatePreferences({ language: lang as AppInfo["config"]["language"] })}
            onChangeTheme={(theme) => void updatePreferences({ themeMode: theme as AppInfo["config"]["themeMode"] })}
          />
        )}

        {/* ---------------------------------------------------------------- */}
        {/*  Center area (flex column)                                       */}
        {/* ---------------------------------------------------------------- */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>

          {!appInfo?.currentWorkspace ? (
            <MainContent
              hasWorkspace={false}
              hasActiveSession={false}
              messages={[]}
              isStreaming={false}
              onInputChange={() => {}}
              onSubmit={() => {}}
              input=""
              actionState="idle"
              onSend={() => {}}
              onStop={() => {}}
              onRetry={() => {}}
              recentWorkspaces={recentWorkspaces.map((w) => ({ path: w.path, name: w.name }))}
              onOpenWorkspace={() => void openWorkspace(workspacePath)}
              onSelectRecentWorkspace={(path) => void openWorkspace(path)}
            />
          ) : (
            <>
              {/* Workspace IS open - IDE body with restructured layout */}
              <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* ---------------------------------------------------------------- */}
                {/*  Middle section: Message Stream + Composer + Editors             */}
                {/* ---------------------------------------------------------------- */}
                <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                  {/* ======== Message Stream (existing code preserved) ======== */}
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

                    {/* ======== Composer (existing code preserved) ======== */}
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

                  {/* ======== Monaco/Diff Editor (existing code preserved) ======== */}
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
                </section>

                {/* ---------------------------------------------------------------- */}
                {/*  Region 14-17: Right Panel (conditionally visible)               */}
                {/*  All existing right panel content rendered inside children slot   */}
                {/* ---------------------------------------------------------------- */}
                {rightPanelVisible && (
                  <RightPanel
                    visible={true}
                    activeTool={activeRightTool}
                    onToolChange={(tool) => setActiveRightTool(tool)}
                  >
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
                      {/* ======== File Preview Section ======== */}
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

                      {/* ======== Patch Preview Section ======== */}
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

                      {/* ======== Search Section ======== */}
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

                      {/* ======== Diagnostics Section ======== */}
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
                  </RightPanel>
                )}
              </div>

              {/* ---------------------------------------------------------------- */}
              {/*  Region 13: Status Bar                                           */}
              {/* ---------------------------------------------------------------- */}
              <StatusBar
                workspaceName={appInfo?.currentWorkspace?.name ?? ''}
                workspacePath={appInfo?.currentWorkspace?.path}
                gitBranch="main"
                gitStatus="synced"
                currentModel={currentModel}
                onModelChange={(model) => setCurrentModel(model)}
              />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
