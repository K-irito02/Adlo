import React, { useCallback, useEffect, useMemo, useRef } from "react";
import type { AppInfo, ModelProviderId } from "@ai-digital-life/kernel";
import { copy, type Locale } from "./copy";
import { DIFF_LAYOUT_STORAGE_KEY } from "./constants";
import { buildSelectionPrompt } from "./selectionPrompt";
import { themeController } from "./theme";
import type { MonacoEditorRef } from "./types";
import { filterDiagnosticsForPath, findFirstDiagnostic, detectEditorLanguage } from "./workspacePaths";
import { mapPatchToEditorTab } from "./editorTabs";
import { buildSettingsItems, preferencePatchFromSettingChange } from "./settingsViewModel";
import { useAppStore } from "./store";
import { useUiStore } from "./ui-store";
import { TitleBar } from "./regions/TitleBar";
import { LeftSidebar } from "./regions/LeftSidebar";
import { CenterPane } from "./regions/CenterPane";
import { RightPanel } from "./regions/RightPanel";
import { isTauriShell } from "../tauri-bridge";

function readDiffSideBySidePreference(): boolean {
  try {
    return window.localStorage.getItem(DIFF_LAYOUT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function App() {
  const store = useAppStore();
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
    indexingStatus,
    repoMap,
    auditEntries,
    commandHistory,
    gitSnapshot,
    gitBranches,
    workspaceContextMode,
    pendingWorkspacePath,
    latestCommandRun,
    terminalOutput,
    activeTerminalExecutionId,
    openTabs,
    selectedFilePath,
    fileContent,
    fileLastModifiedAt,
    externalFileChange,
    outline,
    workspaceTree,
    searchQuery,
    searchResults,
    dirtyEditorPaths,
    bootstrap,
    openWorkspace,
    clearWorkspaceContext,
    setPendingWorkspacePath,
    pickWorkspaceDirectory,
    createSession,
    selectSession,
    pinSession,
    unpinSession,
    markSessionRead,
    markSessionUnread,
    archiveSession,
    archiveAllSessions,
    pinWorkspace,
    unpinWorkspace,
    removeWorkspaceFromSidebar,
    reorderWorkspaces,
    reorderSessions,
    markAllSessionsRead,
    revealWorkspaceInFileManager,
    deleteSession,
    sendMessage,
    cancelActiveStream,
    streamingAssistantText,
    streamingActiveRunId,
    runActivityByRunId,
    runUsageByRunId,
    openFile,
    createWorkspaceFile,
    createWorkspaceFolder,
    refreshWorkspaceTree,
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
    fetchGitBranches,
    switchGitBranch,
    createGitBranch
  } = store;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && (event.key === "o" || event.key === "O")) {
        event.preventDefault();
        void (async () => {
          const picked = await pickWorkspaceDirectory();
          if (picked) {
            await openWorkspace(picked);
            return;
          }
          const input = window.prompt(copy[(appInfo?.config.language ?? "zh-CN") as Locale].workspacePlaceholder);
          if (input && input.trim()) {
            await openWorkspace(input.trim());
          }
        })();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [appInfo?.config.language, openWorkspace, pickWorkspaceDirectory]);

  useEffect(() => {
    if (!isTauriShell()) return;
    let unlisten: undefined | (() => void);

    void (async () => {
      try {
        const mod = await import("@tauri-apps/api/window");
        const win = mod.getCurrentWindow();
        // Tauri v2 drag/drop event shape can differ across versions; handle defensively.
        unlisten = await (win as unknown as { onDragDropEvent: (cb: (e: unknown) => void) => Promise<() => void> }).onDragDropEvent(
          (e: any) => {
            const payload = e?.payload ?? e;
            const type = payload?.type ?? payload?.event ?? payload?.kind;
            if (type !== "drop") return;
            const paths: string[] =
              payload?.paths ??
              payload?.data?.paths ??
              payload?.files ??
              payload?.data?.files ??
              [];
            const first = Array.isArray(paths) ? paths[0] : undefined;
            if (first && typeof first === "string") {
              void openWorkspace(first);
            }
          }
        );
      } catch {
        // Best-effort: drag-drop open is only available in Tauri shell.
      }
    })();

    return () => {
      try {
        unlisten?.();
      } catch {
        /* ignore */
      }
    };
  }, [openWorkspace]);

  const leftCollapsed = useUiStore((state) => state.leftCollapsed);
  const rightCollapsed = useUiStore((state) => state.rightCollapsed);
  const activeTool = useUiStore((state) => state.activeTool);
  const setActiveTool = useUiStore((state) => state.setActiveTool);
  const rightPanelWidth = useUiStore((state) => state.rightPanelWidth);
  const [diffSideBySide, setDiffSideBySide] = React.useState(readDiffSideBySidePreference);
  const [commandBinary, setCommandBinary] = React.useState("npm");
  const [commandArgs, setCommandArgs] = React.useState("run test");
  const [editorHint, setEditorHint] = React.useState<string>();
  const [localSearchQuery, setLocalSearchQuery] = React.useState(searchQuery);
  const standardEditorRef = useRef<MonacoEditorRef | null>(null);
  const diffEditorRef = useRef<MonacoEditorRef | null>(null);
  const editorDirtyTimerRef = useRef<number | undefined>(undefined);

  const locale = (appInfo?.config.language ?? "zh-CN") as Locale;
  const t = copy[locale];
  const activeDetail = activeSessionId ? sessionDetails[activeSessionId] : undefined;
  const settings = useMemo(() => buildSettingsItems(t, appInfo), [appInfo, t]);

  useEffect(() => {
    void window.digitalLife.window.setTitle(t.brandHoverName);
  }, [t.brandHoverName]);

  const filePatch = useMemo(() => {
    if (!activePatchSet) return undefined;
    if (!selectedFilePath) return activePatchSet.filePatches[0];
    return (
      activePatchSet.filePatches.find((candidate) => candidate.relativePath === selectedFilePath) ??
      activePatchSet.filePatches[0]
    );
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
    return [...openTabs, ...(activePatchSet?.filePatches.map(mapPatchToEditorTab) ?? [])].filter(
      (tab) => {
        if (seen.has(tab.path)) return false;
        seen.add(tab.path);
        return true;
      }
    );
  }, [activePatchSet?.filePatches, openTabs]);

  const persistDiffLayout = useCallback((sideBySide: boolean) => {
    setDiffSideBySide(sideBySide);
    try {
      window.localStorage.setItem(DIFF_LAYOUT_STORAGE_KEY, sideBySide ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const handleStandardEditorChange = useCallback(
    (value: string | undefined) => {
      const pathAtEdit = selectedFilePath;
      if (!pathAtEdit) return;
      window.clearTimeout(editorDirtyTimerRef.current);
      editorDirtyTimerRef.current = window.setTimeout(() => {
        if (useAppStore.getState().selectedFilePath !== pathAtEdit) return;
        const baseline = useAppStore.getState().fileContent ?? "";
        const dirty = (value ?? "") !== baseline;
        notifyEditorBufferDirty(pathAtEdit, dirty);
      }, 300);
    },
    [notifyEditorBufferDirty, selectedFilePath]
  );

  useEffect(() => () => window.clearTimeout(editorDirtyTimerRef.current), [selectedFilePath]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!activePatchSet) return;
    if (rightCollapsed) return;
    if (activeTool === "changes") return;
    setActiveTool("changes");
  }, [activePatchSet, activeTool, rightCollapsed, setActiveTool]);

  useEffect(() => {
    if (!appInfo) return;
    themeController.setTheme({
      mode: appInfo.config.themeMode,
      resolvedTheme: appInfo.config.resolvedTheme
    });
    themeController.hydrate();
  }, [appInfo]);

  useEffect(() => {
    if (!appInfo?.currentWorkspace) return;
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
    if (!activeDiagnostic?.line) return;
    const editor = diffEditorRef.current ?? standardEditorRef.current;
    editor?.revealLineInCenter(activeDiagnostic.line);
  }, [activeDiagnostic]);

  useEffect(() => {
    const editor = standardEditorRef.current as unknown as { getModel?: () => unknown } | null;
    const model = editor?.getModel?.();
    const monacoEditor = (
      window as typeof window & {
        monaco?: {
          editor: {
            setModelMarkers: (model: unknown, owner: string, markers: unknown[]) => void;
            MarkerSeverity: { Error: number; Warning: number; Info: number };
          };
        };
      }
    ).monaco;

    if (!model || !monacoEditor) return;

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

  const handleSendSelection = useCallback(async () => {
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
  }, [locale, selectedFilePath, sendMessage, t.noSelection]);

  const handleCycleTheme = useCallback(() => {
    const mode = appInfo?.config.themeMode ?? "system";
    const next: AppInfo["config"]["themeMode"] =
      mode === "system" ? "light" : mode === "light" ? "dark" : "system";
    void updatePreferences({ themeMode: next });
  }, [appInfo?.config.themeMode, updatePreferences]);

  const handleSelectLanguage = useCallback(
    (language: AppInfo["config"]["language"]) => {
      void updatePreferences({ language });
    },
    [updatePreferences]
  );

  const handleSelectModel = useCallback(
    (providerId: string) => {
      void updatePreferences({
        modelPreferences: {
          [providerId as ModelProviderId]: { priority: 1, enabled: true }
        }
      });
    },
    [updatePreferences]
  );

  const handleTriggerCreateWorkspace = useCallback(async () => {
    const picked = await pickWorkspaceDirectory();
    if (picked) {
      void openWorkspace(picked);
      return;
    }
    const input = window.prompt(t.workspacePlaceholder);
    if (input && input.trim()) {
      void openWorkspace(input.trim());
    }
  }, [openWorkspace, pickWorkspaceDirectory, t.workspacePlaceholder]);

  const handleOpenSettings = useCallback(() => {
    useUiStore.getState().setActiveTool("settings");
  }, []);

  const handleChangeSetting = useCallback(
    (id: string, value: string | boolean | number) => {
      const patch = preferencePatchFromSettingChange(id, value);
      if (patch) {
        void updatePreferences(patch);
      }
    },
    [updatePreferences]
  );

  const handleOpenCommandPalette = useCallback(() => {
    // Command palette is planned for a future phase. For now, surface
    // the search tool as a graceful fallback.
    useUiStore.getState().setActiveTool("files");
  }, []);

  const handleEditorMount = useCallback(
    (editor: MonacoEditorRef, monaco: unknown) => {
      standardEditorRef.current = editor;
      (window as typeof window & { monaco?: typeof monaco }).monaco = monaco;
    },
    []
  );

  const handleDiffMount = useCallback((editor: MonacoEditorRef) => {
    diffEditorRef.current = editor;
  }, []);

  const handleApplyPatch = useCallback(() => {
    if (activePatchSet) void applyPatchSet(activePatchSet.id);
  }, [activePatchSet, applyPatchSet]);

  const handleRollbackPatch = useCallback(() => {
    if (activePatchSet) void rollbackPatchSet(activePatchSet.id);
  }, [activePatchSet, rollbackPatchSet]);

  const handleSetHunkDecision = useCallback(
    (hunkId: string, decision: "pending" | "accepted" | "rejected") => {
      if (activePatchSet) void setHunkDecision(activePatchSet.id, hunkId, decision);
    },
    [activePatchSet, setHunkDecision]
  );

  const handleReloadExternal = useCallback(() => {
    if (selectedFilePath) void openFile(selectedFilePath);
  }, [openFile, selectedFilePath]);

  const handleSearchSubmit = useCallback(
    (query: string) => {
      void searchFiles(query);
    },
    [searchFiles]
  );

  if (loading) {
    return (
      <main className="adl-shell" aria-busy="true">
        <div className="adl-shell__loading">
          <p>{t.loading}</p>
        </div>
      </main>
    );
  }

  const hasWorkspace = !!appInfo?.currentWorkspace;

  return (
    <main className="adl-shell adl-ide">
        <TitleBar
          t={t}
          appInfo={appInfo}
          onOpenSettings={handleOpenSettings}
          onTriggerCreateWorkspace={handleTriggerCreateWorkspace}
          onOpenCommandPalette={handleOpenCommandPalette}
          onCycleTheme={handleCycleTheme}
          onSelectLanguage={handleSelectLanguage}
        />

      {error ? (
        <div className="adl-banner adl-banner--error" role="alert">
          {error}
        </div>
      ) : null}

      <div
        className={`adl-shell__body${leftCollapsed ? " is-left-collapsed" : ""}${rightCollapsed ? " is-right-collapsed" : ""}`}
        style={{ "--rightpanel-width": `${rightPanelWidth}px` } as React.CSSProperties}
      >
        <LeftSidebar
          t={t}
          locale={locale}
          appInfo={appInfo}
          collapsed={leftCollapsed}
          recentWorkspaces={recentWorkspaces}
          sessions={sessions}
          activeSessionId={activeSessionId}
          streamingActiveRunId={streamingActiveRunId}
          taskCenter={taskCenter}
          indexingStatus={indexingStatus}
          onSelectSession={(id) => void selectSession(id)}
          onCreateSession={() => void createSession()}
          onPinWorkspace={(workspaceId) => void pinWorkspace(workspaceId)}
          onUnpinWorkspace={(workspaceId) => void unpinWorkspace(workspaceId)}
          onRemoveWorkspace={(workspaceId) => void removeWorkspaceFromSidebar(workspaceId)}
          onReorderWorkspaces={(input) => void reorderWorkspaces(input)}
          onPinSession={(sessionId) => void pinSession(sessionId)}
          onUnpinSession={(sessionId) => void unpinSession(sessionId)}
          onRenameSession={(sessionId, title) => void store.renameSession(sessionId, title)}
          onArchiveSession={(sessionId) => void archiveSession(sessionId)}
          onArchiveAllSessions={() => void archiveAllSessions()}
          onMarkSessionRead={(sessionId) => void markSessionRead(sessionId)}
          onMarkSessionUnread={(sessionId) => void markSessionUnread(sessionId)}
          onMarkAllSessionsRead={(sessionIds) => void markAllSessionsRead(sessionIds)}
          onReorderSessions={(input) => void reorderSessions(input)}
          onRevealWorkspace={(workspacePath) => void revealWorkspaceInFileManager(workspacePath)}
          onDeleteSession={(sessionId) => void deleteSession(sessionId)}
          onOpenWorkspace={(path) => void openWorkspace(path)}
          onTriggerCreateWorkspace={handleTriggerCreateWorkspace}
        />

        <CenterPane
          t={t}
          locale={locale}
          appInfo={appInfo}
          hasWorkspace={hasWorkspace}
          activeDetail={activeDetail}
          streamingAssistantText={streamingAssistantText}
          streamingActiveRunId={streamingActiveRunId}
          activeRun={activeRun}
          runActivityByRunId={runActivityByRunId}
          runUsageByRunId={runUsageByRunId}
          modelHealth={modelHealth}
          taskCenter={taskCenter}
          workspaceContextMode={workspaceContextMode}
          pendingWorkspacePath={pendingWorkspacePath}
          gitSnapshot={gitSnapshot}
          gitBranches={gitBranches}
          recentWorkspaces={recentWorkspaces}
          onSendMessage={async (content, opts) => {
            await sendMessage(content, { mode: opts.mode, chips: opts.chips });
          }}
          onCancelGenerate={() => void cancelActiveStream()}
          onOpenWorkspace={(path) => void openWorkspace(path)}
          onTriggerCreateWorkspace={handleTriggerCreateWorkspace}
          onClearWorkspaceContext={clearWorkspaceContext}
          onSetPendingWorkspacePath={setPendingWorkspacePath}
          onPickWorkspaceDirectory={pickWorkspaceDirectory}
          onCreateSession={() => void createSession()}
          onDecideApproval={(approvalId, decision) => void decideApproval(approvalId, decision)}
          onSelectModel={handleSelectModel}
          onRefreshGitBranches={fetchGitBranches}
          onSwitchGitBranch={switchGitBranch}
          onCreateGitBranch={createGitBranch}
        />

        <RightPanel
          t={t}
          appInfo={appInfo}
          collapsed={rightCollapsed}
          editorTabs={mergedTabs}
          selectedFilePath={selectedFilePath}
          fileContent={fileContent}
          fileLastModifiedAt={fileLastModifiedAt}
          externalChangePath={externalFileChange?.path}
          editorLanguage={editorLanguage}
          diffSideBySide={diffSideBySide}
          filePatch={filePatch}
          diagnostics={selectedDiagnostics}
          editorHint={editorHint}
          outline={outline}
          workspaceTree={workspaceTree}
          repoMap={repoMap}
          searchQuery={localSearchQuery}
          searchResults={searchResults}
          dirtyEditorPaths={dirtyEditorPaths}
          auditEntries={auditEntries}
          settings={settings}
          gitSnapshot={gitSnapshot}
          commandHistory={commandHistory}
          standardEditorRef={standardEditorRef}
          diffEditorRef={diffEditorRef}
            onOpenFile={(path) => void openFile(path)}
            onReloadExternal={handleReloadExternal}
            onCreateWorkspaceFile={createWorkspaceFile}
            onCreateWorkspaceFolder={createWorkspaceFolder}
            onEditorChange={handleStandardEditorChange}
          onEditorMount={handleEditorMount}
          onDiffMount={handleDiffMount}
          onSearch={handleSearchSubmit}
          onSearchChange={setLocalSearchQuery}
          onRefreshWorkspaceTree={() => void refreshWorkspaceTree()}
          onSendSelection={() => void handleSendSelection()}
          onSetDiffLayout={persistDiffLayout}
          activePatchSet={activePatchSet}
          latestPatchApplication={latestPatchApplication}
          onSetHunkDecision={handleSetHunkDecision}
          onApplyPatchSet={handleApplyPatch}
          onRollbackPatchSet={handleRollbackPatch}
          modelHealth={modelHealth}
          onRefreshModelHealth={() => void refreshModelHealth()}
          onChangeSetting={handleChangeSetting}
          commandBinary={commandBinary}
          commandArgs={commandArgs}
          latestCommandRun={latestCommandRun}
          terminalOutput={terminalOutput}
          activeTerminalExecutionId={activeTerminalExecutionId}
          onCommandBinaryChange={setCommandBinary}
          onCommandArgsChange={setCommandArgs}
          onRunCommand={() => void runCommand(commandBinary, commandArgs)}
          onRunCommandStream={() => void runCommandStream(commandBinary, commandArgs)}
          onStopCommandStream={() => void stopCommandStream()}
        />
      </div>

    </main>
  );
}
