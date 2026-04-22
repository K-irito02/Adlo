import React, { useCallback, useEffect, useMemo, useRef } from "react";
import type { AppInfo, ModelProviderId } from "@ai-digital-life/kernel";
import { copy, type Locale } from "./copy";
import { DIFF_LAYOUT_STORAGE_KEY } from "./constants";
import { buildSelectionPrompt } from "./selectionPrompt";
import { themeController } from "./theme";
import type { MonacoEditorRef } from "./types";
import { filterDiagnosticsForPath, findFirstDiagnostic, detectEditorLanguage } from "./workspacePaths";
import { mapPatchToEditorTab } from "./editorTabs";
import { useAppStore } from "./store";
import { useUiStore } from "./ui-store";
import { TitleBar } from "./regions/TitleBar";
import { LeftSidebar } from "./regions/LeftSidebar";
import { CenterPane } from "./regions/CenterPane";
import { StatusBar } from "./regions/StatusBar";
import { RightPanel } from "./regions/RightPanel";

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
    latestCommandRun,
    terminalOutput,
    activeTerminalExecutionId,
    openTabs,
    selectedFilePath,
    fileContent,
    externalFileChange,
    searchQuery,
    searchResults,
    bootstrap,
    openWorkspace,
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
  } = store;

  const { leftCollapsed, rightCollapsed, activeTool, setActiveTool } = useUiStore();
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

  const handleTriggerCreateWorkspace = useCallback(() => {
    const input = window.prompt(t.workspacePlaceholder);
    if (input && input.trim()) {
      void openWorkspace(input.trim());
    }
  }, [openWorkspace, t.workspacePlaceholder]);

  const handleOpenSettings = useCallback(() => {
    useUiStore.getState().setActiveTool("changes");
  }, []);

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
      />

      {error ? (
        <div className="adl-banner adl-banner--error" role="alert">
          {error}
        </div>
      ) : null}

      <div
        className={`adl-shell__body${leftCollapsed ? " is-left-collapsed" : ""}${rightCollapsed ? " is-right-collapsed" : ""}`}
      >
        <LeftSidebar
          t={t}
          locale={locale}
          appInfo={appInfo}
          recentWorkspaces={recentWorkspaces}
          sessions={sessions}
          activeSessionId={activeSessionId}
          streamingActiveRunId={streamingActiveRunId}
          taskCenter={taskCenter}
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
          onCycleTheme={handleCycleTheme}
          onSelectLanguage={handleSelectLanguage}
        />

        <CenterPane
          t={t}
          locale={locale}
          hasWorkspace={hasWorkspace}
          activeDetail={activeDetail}
          streamingAssistantText={streamingAssistantText}
          streamingActiveRunId={streamingActiveRunId}
          activeRun={activeRun}
          taskCenter={taskCenter}
          recentWorkspaces={recentWorkspaces}
          onSendMessage={async (content) => {
            await sendMessage(content);
          }}
          onCancelGenerate={() => void cancelActiveStream()}
          onOpenWorkspace={(path) => void openWorkspace(path)}
          onTriggerCreateWorkspace={handleTriggerCreateWorkspace}
          onCreateSession={() => void createSession()}
          onDecideApproval={(approvalId, decision) => void decideApproval(approvalId, decision)}
        />

        <RightPanel
          t={t}
          appInfo={appInfo}
          collapsed={rightCollapsed}
          editorTabs={mergedTabs}
          selectedFilePath={selectedFilePath}
          fileContent={fileContent}
          externalChangePath={externalFileChange?.path}
          editorLanguage={editorLanguage}
          diffSideBySide={diffSideBySide}
          filePatch={filePatch}
          diagnostics={selectedDiagnostics}
          editorHint={editorHint}
          searchQuery={localSearchQuery}
          searchResults={searchResults}
          standardEditorRef={standardEditorRef}
          diffEditorRef={diffEditorRef}
          onOpenFile={(path) => void openFile(path)}
          onReloadExternal={handleReloadExternal}
          onEditorChange={handleStandardEditorChange}
          onEditorMount={handleEditorMount}
          onDiffMount={handleDiffMount}
          onSearch={handleSearchSubmit}
          onSearchChange={setLocalSearchQuery}
          onSendSelection={() => void handleSendSelection()}
          onSetDiffLayout={persistDiffLayout}
          activePatchSet={activePatchSet}
          latestPatchApplication={latestPatchApplication}
          onSetHunkDecision={handleSetHunkDecision}
          onApplyPatchSet={handleApplyPatch}
          onRollbackPatchSet={handleRollbackPatch}
          modelHealth={modelHealth}
          onRefreshModelHealth={() => void refreshModelHealth()}
          onUpdatePreference={(patch) => void updatePreferences(patch as never)}
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

      <StatusBar
        t={t}
        appInfo={appInfo}
        currentWorkspace={appInfo?.currentWorkspace}
        modelHealth={modelHealth}
        isStreaming={!!streamingActiveRunId}
        onSelectModel={handleSelectModel}
      />
    </main>
  );
}
