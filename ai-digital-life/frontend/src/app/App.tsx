import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { AppInfo, ModelProviderId } from "@ai-digital-life/kernel";
import { copy, type Locale } from "./copy";
import { DIFF_LAYOUT_STORAGE_KEY } from "./constants";
import { MODEL_PROVIDER_IDS } from "./constants";
import { buildSelectionPrompt } from "./selectionPrompt";
import { themeController } from "./theme";
import type { EditorRef, DiffEditorRef } from "./types";
import { filterDiagnosticsForPath, findFirstDiagnostic, detectEditorLanguage } from "./workspacePaths";
import { mapPatchToEditorTab } from "./editorTabs";
import { buildSettingsItems, preferencePatchFromSettingChange } from "./settingsViewModel";
import { useAppStore } from "./stores/slicedStore";
import { useUiStore } from "./ui-store";
import { useAppActions } from "./hooks/useAppActions";
import { TitleBar } from "./regions/TitleBar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LeftSidebar } from "./regions/LeftSidebar";
import { CenterPane } from "./regions/CenterPane";
import { RightPanel } from "./regions/RightPanel";
import { NewSessionDialog } from "./components/NewSessionDialog";
import { CreateWorkspaceModal } from "./components/CreateWorkspaceModal";
import {
  findPatchFileByPath,
  getAdjacentPatchHunk,
  getPatchHunkTargetLine,
  type PatchDirection,
  type PatchReviewFilter,
  setCollapsedHunksForFile,
  toggleCollapsedHunkId
} from "./features/patch-review";
import { isTauriShell } from "../tauri-bridge";

function readDiffSideBySidePreference(): boolean {
  try {
    return window.localStorage.getItem(DIFF_LAYOUT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function App() {
  const error = useAppStore((state) => state.error);

  const actions = useAppActions();

  const {
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
    latestCommandRun,
    openTabs,
    selectedFilePath,
    selectedChangePreviewPath,
    changePreview,
    changePreviewLoading,
    fileContent,
    fileLastModifiedAt,
    externalFileChange,
    outline,
    workspaceTree,
    searchQuery,
    searchResults,
    dirtyEditorPaths,
    streamingAssistantText,
    streamingActiveRunId,
    runActivityByRunId,
    runUsageByRunId
  } = useAppStore(
    useShallow((state) => ({
      appInfo: state.appInfo,
      recentWorkspaces: state.recentWorkspaces,
      sessions: state.sessions,
      activeSessionId: state.activeSessionId,
      sessionDetails: state.sessionDetails,
      activeRun: state.activeRun,
      activePatchSet: state.activePatchSet,
      latestPatchApplication: state.latestPatchApplication,
      taskCenter: state.taskCenter,
      modelHealth: state.modelHealth,
      indexingStatus: state.indexingStatus,
      repoMap: state.repoMap,
      auditEntries: state.auditEntries,
      commandHistory: state.commandHistory,
      gitSnapshot: state.gitSnapshot,
      gitBranches: state.gitBranches,
      workspaceContextMode: state.workspaceContextMode,
      latestCommandRun: state.latestCommandRun,
      openTabs: state.openTabs,
      selectedFilePath: state.selectedFilePath,
      selectedChangePreviewPath: state.selectedChangePreviewPath,
      changePreview: state.changePreview,
      changePreviewLoading: state.changePreviewLoading,
      fileContent: state.fileContent,
      fileLastModifiedAt: state.fileLastModifiedAt,
      externalFileChange: state.externalFileChange,
      outline: state.outline,
      workspaceTree: state.workspaceTree,
      searchQuery: state.searchQuery,
      searchResults: state.searchResults,
      dirtyEditorPaths: state.dirtyEditorPaths,
      streamingAssistantText: state.streamingAssistantText,
      streamingActiveRunId: state.streamingActiveRunId,
      runActivityByRunId: state.runActivityByRunId,
      runUsageByRunId: state.runUsageByRunId
    }))
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === "n" || event.key === "N")) {
        event.preventDefault();
        setNewSessionDialogOpen(true);
      } else if ((event.ctrlKey || event.metaKey) && (event.key === "n" || event.key === "N")) {
        event.preventDefault();
        setCreateWorkspaceModalOpen(true);
      } else if ((event.ctrlKey || event.metaKey) && (event.key === "o" || event.key === "O")) {
        event.preventDefault();
        void actions.pickWorkspaceDirectory().then((picked) => {
          if (picked) void actions.openWorkspace(picked);
        });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actions.openWorkspace, actions.pickWorkspaceDirectory]);

  useEffect(() => {
    if (!isTauriShell()) return;
    let unlisten: undefined | (() => void);

    void (async () => {
      try {
        const mod = await import("@tauri-apps/api/window");
        const win = mod.getCurrentWindow();
        unlisten = await (win as unknown as { onDragDropEvent: (cb: (e: unknown) => void) => Promise<() => void> }).onDragDropEvent(
          (e: unknown) => {
            const payload = (e as Record<string, any>)?.payload ?? e;
            const type = (payload as Record<string, any>)?.type ?? (payload as Record<string, any>)?.event ?? (payload as Record<string, any>)?.kind;
            if (type !== "drop") return;
            const paths: string[] =
              (payload as Record<string, any>)?.paths ??
              (payload as Record<string, any>)?.data?.paths ??
              (payload as Record<string, any>)?.files ??
              (payload as Record<string, any>)?.data?.files ??
              [];
            const first = Array.isArray(paths) ? paths[0] : undefined;
            if (first && typeof first === "string") {
              void actions.openWorkspace(first);
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
  }, [actions.openWorkspace]);

  useEffect(() => {
    if (isTauriShell()) return;

    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "link";
      }
    };

    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      if (!event.dataTransfer) return;
      const items = event.dataTransfer.items;
      if (!items || items.length === 0) return;
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.();
        if (entry && entry.isDirectory) {
          const file = items[i].getAsFile();
          if (file) {
            const path = (file as File & { path?: string }).path;
            if (path) {
              void actions.openWorkspace(path);
              return;
            }
            void actions.openWorkspace(file.name);
            return;
          }
        }
      }
      const file = items[0].getAsFile();
      if (file) {
        const path = (file as File & { path?: string }).path;
        if (path) {
          void actions.openWorkspace(path);
        }
      }
    };

    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("drop", handleDrop);
    return () => {
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("drop", handleDrop);
    };
  }, [actions.openWorkspace]);

  const leftCollapsed = useUiStore((state) => state.leftCollapsed);
  const rightCollapsed = useUiStore((state) => state.rightCollapsed);
  const activeTool = useUiStore((state) => state.activeTool);
  const setActiveTool = useUiStore((state) => state.setActiveTool);
  const rightPanelWidth = useUiStore((state) => state.rightPanelWidth);
  const [diffSideBySide, setDiffSideBySide] = React.useState(readDiffSideBySidePreference);
  const [editorHint, setEditorHint] = React.useState<string>();
  const [localSearchQuery, setLocalSearchQuery] = React.useState(searchQuery);
  const [selectedPatchFilePath, setSelectedPatchFilePath] = useState<string>();
  const [selectedPatchHunkId, setSelectedPatchHunkId] = useState<string>();
  const [collapsedPatchHunkIds, setCollapsedPatchHunkIds] = useState<string[]>([]);
  const [patchReviewFilter, setPatchReviewFilter] = useState<PatchReviewFilter>("all");
  const standardEditorRef = useRef<EditorRef | null>(null);
  const diffEditorRef = useRef<EditorRef | DiffEditorRef | null>(null);
  const editorDirtyTimerRef = useRef<number | undefined>(undefined);
  const pendingRevealRef = useRef<{ path: string; line: number } | null>(null);

  const locale = (appInfo?.config.language ?? "zh-CN") as Locale;
  const t = copy[locale];
  const activeDetail = activeSessionId ? sessionDetails[activeSessionId] : undefined;
  const settings = useMemo(() => buildSettingsItems(t, appInfo), [appInfo, t]);

  useEffect(() => {
    void window.digitalLife.window.setTitle(t.brandHoverName);
  }, [t.brandHoverName]);

  const filePatch = useMemo(() => {
    if (!activePatchSet) return undefined;
    return findPatchFileByPath(activePatchSet, selectedPatchFilePath ?? selectedFilePath);
  }, [activePatchSet, selectedFilePath, selectedPatchFilePath]);

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
        actions.notifyEditorBufferDirty(pathAtEdit, dirty);
      }, 300);
    },
    [actions.notifyEditorBufferDirty, selectedFilePath]
  );

  useEffect(() => () => window.clearTimeout(editorDirtyTimerRef.current), [selectedFilePath]);

  useEffect(() => {
    void actions.bootstrap();
  }, [actions.bootstrap]);

  useEffect(() => {
    if (!activePatchSet) return;
    if (rightCollapsed) return;
    if (activeTool === "changes") return;
    setActiveTool("changes");
  }, [activePatchSet, activeTool, rightCollapsed, setActiveTool]);

  useEffect(() => {
    if (!activePatchSet) {
      setSelectedPatchFilePath(undefined);
      setSelectedPatchHunkId(undefined);
      setCollapsedPatchHunkIds([]);
      setPatchReviewFilter("all");
      return;
    }

    const fallbackFile = findPatchFileByPath(activePatchSet, selectedPatchFilePath ?? selectedFilePath);
    const nextFilePath = fallbackFile?.relativePath;
    setSelectedPatchFilePath((current) => {
      if (current && activePatchSet.filePatches.some((filePatchItem) => filePatchItem.relativePath === current)) {
        return current;
      }
      return nextFilePath;
    });
    setSelectedPatchHunkId((current) => {
      if (current && activePatchSet.filePatches.some((filePatchItem) => filePatchItem.hunks.some((hunk) => hunk.id === current))) {
        return current;
      }
      return fallbackFile?.hunks[0]?.id;
    });
    setCollapsedPatchHunkIds((current) =>
      current.filter((hunkId) => activePatchSet.filePatches.some((filePatchItem) => filePatchItem.hunks.some((hunk) => hunk.id === hunkId)))
    );
  }, [activePatchSet, selectedFilePath, selectedPatchFilePath]);

  useEffect(() => {
    if (!activePatchSet || !selectedFilePath) return;
    if (activePatchSet.filePatches.some((filePatchItem) => filePatchItem.relativePath === selectedFilePath)) {
      setSelectedPatchFilePath(selectedFilePath);
    }
  }, [activePatchSet, selectedFilePath]);

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
      void actions.refreshTaskCenter();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [appInfo?.currentWorkspace, actions.refreshTaskCenter]);

  useEffect(() => {
    return window.digitalLife.workspace.onFileChanged((event) => {
      actions.markExternalFileChange(event);
    });
  }, [actions.markExternalFileChange]);

  useEffect(() => {
    if (!activeDiagnostic?.line) return;
    const raw = diffEditorRef.current ?? standardEditorRef.current;
    const editor = raw && "getModifiedEditor" in raw ? (raw as DiffEditorRef).getModifiedEditor() : raw;
    if (!editor) return;
    editor.revealLineInCenter(activeDiagnostic.line);
    editor.setPosition({ lineNumber: activeDiagnostic.line, column: 1 });
    editor.focus();
  }, [activeDiagnostic]);

  useEffect(() => {
    const pending = pendingRevealRef.current;
    if (!pending) return;
    if (!selectedFilePath || selectedFilePath !== pending.path) return;
    const raw = diffEditorRef.current ?? standardEditorRef.current;
    const editor = raw && "getModifiedEditor" in raw ? (raw as DiffEditorRef).getModifiedEditor() : raw;
    if (!editor) return;
    editor.revealLineInCenter(pending.line);
    editor.setPosition({ lineNumber: pending.line, column: 1 });
    editor.focus();
    pendingRevealRef.current = null;
  }, [fileLastModifiedAt, selectedFilePath]);

  const handleSendSelection = useCallback(async () => {
    const raw = diffEditorRef.current ?? standardEditorRef.current;
    const editor = raw && "getModifiedEditor" in raw ? (raw as DiffEditorRef).getModifiedEditor() : raw;
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
    await actions.sendMessage(buildSelectionPrompt(locale, selectedFilePath, selectedText));
  }, [locale, selectedFilePath, actions.sendMessage, t.noSelection]);

  const handleOpenFileAtLine = useCallback(
    (relativePath: string, line: number) => {
      pendingRevealRef.current = { path: relativePath, line };
      void actions.openFile(relativePath);
    },
    [actions.openFile]
  );

  const handleSelectPatchFile = useCallback(
    (relativePath: string, options?: { activateTool?: boolean; line?: number; hunkId?: string }) => {
      const matchingFile = findPatchFileByPath(activePatchSet, relativePath);
      const nextHunkId = options?.hunkId ?? matchingFile?.hunks[0]?.id;
      setSelectedPatchFilePath(relativePath);
      if (nextHunkId) {
        setSelectedPatchHunkId(nextHunkId);
      }
      if (typeof options?.line === "number") {
        pendingRevealRef.current = { path: relativePath, line: options.line };
      }
      if (options?.activateTool) {
        setActiveTool("files");
        void actions.openFile(relativePath);
      }
    },
    [activePatchSet, actions.openFile, setActiveTool]
  );

  const handleSelectPatchHunk = useCallback(
    (relativePath: string, hunkId: string, line: number, options?: { activateTool?: boolean }) => {
      setSelectedPatchFilePath(relativePath);
      setSelectedPatchHunkId(hunkId);
      pendingRevealRef.current = { path: relativePath, line };
      if (options?.activateTool) {
        setActiveTool("files");
        void actions.openFile(relativePath);
      }
    },
    [actions.openFile, setActiveTool]
  );

  const handleTogglePatchHunkCollapse = useCallback((hunkId: string) => {
    setCollapsedPatchHunkIds((current) => toggleCollapsedHunkId(current, hunkId));
  }, []);

  const handleSetAllPatchHunksCollapsed = useCallback(
    (collapsed: boolean, relativePath?: string) => {
      const targetFile = findPatchFileByPath(activePatchSet, relativePath ?? selectedPatchFilePath ?? selectedFilePath);
      setCollapsedPatchHunkIds((current) => setCollapsedHunksForFile(current, targetFile, collapsed));
    },
    [activePatchSet, selectedFilePath, selectedPatchFilePath]
  );

  const handleJumpPatchHunk = useCallback(
    (direction: PatchDirection) => {
      const nextHunk = getAdjacentPatchHunk(activePatchSet, selectedPatchHunkId, direction);
      if (!nextHunk) return;
      handleSelectPatchHunk(nextHunk.relativePath, nextHunk.id, getPatchHunkTargetLine(nextHunk), {
        activateTool: true
      });
    },
    [activePatchSet, handleSelectPatchHunk, selectedPatchHunkId]
  );

  const handleCycleTheme = useCallback(() => {
    const mode = appInfo?.config.themeMode ?? "system";
    const next: AppInfo["config"]["themeMode"] =
      mode === "system" ? "light" : mode === "light" ? "dark" : "system";
    void actions.updatePreferences({ themeMode: next });
  }, [appInfo?.config.themeMode, actions.updatePreferences]);

  const handleSelectLanguage = useCallback(
    (language: AppInfo["config"]["language"]) => {
      void actions.updatePreferences({ language });
    },
    [actions.updatePreferences]
  );

  const handleSelectModel = useCallback(
    (providerId: ModelProviderId, modelId?: string) => {
      const patch: Record<ModelProviderId, { priority?: number; enabled?: boolean; modelId?: string }> =
        {} as Record<ModelProviderId, { priority?: number; enabled?: boolean; modelId?: string }>;

      for (const id of MODEL_PROVIDER_IDS) {
        if (id === providerId) {
          patch[id] = {
            priority: 1,
            enabled: true,
            ...(modelId ? { modelId } : {})
          };
        } else {
          patch[id] = { priority: 2 };
        }
      }

      void actions.updatePreferences({ modelPreferences: patch });
    },
    [actions.updatePreferences]
  );

  const [createWorkspaceModalOpen, setCreateWorkspaceModalOpen] = useState(false);
  const [newSessionDialogOpen, setNewSessionDialogOpen] = useState(false);

  const handleTriggerCreateWorkspace = useCallback(() => {
    setCreateWorkspaceModalOpen(true);
  }, []);

  const handleOpenFolder = useCallback(() => {
    void actions.pickWorkspaceDirectory().then((picked) => {
      if (picked) void actions.openWorkspace(picked);
    });
  }, [actions.openWorkspace, actions.pickWorkspaceDirectory]);

  const handleOpenSettings = useCallback(() => {
    useUiStore.getState().setActiveTool("settings");
  }, []);

  const handleChangeSetting = useCallback(
    (id: string, value: string | boolean | number) => {
      const patch = preferencePatchFromSettingChange(id, value);
      if (patch) {
        void actions.updatePreferences(patch);
      }
    },
    [actions.updatePreferences]
  );

  const handleOpenCommandPalette = useCallback(() => {
    // Command palette is planned for a future phase. For now, surface
    // the search tool as a graceful fallback.
    useUiStore.getState().setActiveTool("files");
  }, []);

  const handleEditorMount = useCallback(
    (editor: EditorRef) => {
      standardEditorRef.current = editor;
    },
    []
  );

  const handleDiffMount = useCallback((editor: EditorRef | DiffEditorRef) => {
    diffEditorRef.current = editor;
  }, []);

  const handleApplyPatch = useCallback(() => {
    if (activePatchSet) void actions.applyPatchSet(activePatchSet.id);
  }, [activePatchSet, actions.applyPatchSet]);

  const handleRollbackPatch = useCallback(() => {
    if (activePatchSet) void actions.rollbackPatchSet(activePatchSet.id);
  }, [activePatchSet, actions.rollbackPatchSet]);

  const handleSetHunkDecision = useCallback(
    (hunkId: string, decision: "pending" | "accepted" | "rejected") => {
      if (activePatchSet) void actions.setHunkDecision(activePatchSet.id, hunkId, decision);
    },
    [activePatchSet, actions.setHunkDecision]
  );

  const handleReloadExternal = useCallback(() => {
    if (selectedFilePath) void actions.openFile(selectedFilePath);
  }, [actions.openFile, selectedFilePath]);

  const handleSearchSubmit = useCallback(
    (query: string) => {
      void actions.searchFiles(query);
    },
    [actions.searchFiles]
  );

  const hasWorkspace = !!appInfo?.currentWorkspace;

  return (
    <main className="adl-shell adl-ide">
        <TitleBar
          t={t}
          appInfo={appInfo}
          onOpenSettings={handleOpenSettings}
          onTriggerCreateWorkspace={handleTriggerCreateWorkspace}
          onOpenFolder={handleOpenFolder}
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
        <ErrorBoundary><LeftSidebar
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
          onSelectSession={(id) => void actions.selectSession(id)}
          onCreateSession={() => setNewSessionDialogOpen(true)}
          onPinWorkspace={(workspaceId) => void actions.pinWorkspace(workspaceId)}
          onUnpinWorkspace={(workspaceId) => void actions.unpinWorkspace(workspaceId)}
          onRemoveWorkspace={(workspaceId) => void actions.removeWorkspaceFromSidebar(workspaceId)}
          onReorderWorkspaces={(input) => void actions.reorderWorkspaces(input)}
          onPinSession={(sessionId) => void actions.pinSession(sessionId)}
          onUnpinSession={(sessionId) => void actions.unpinSession(sessionId)}
          onRenameSession={(sessionId, title) => void actions.renameSession(sessionId, title)}
          onArchiveSession={(sessionId) => void actions.archiveSession(sessionId)}
          onArchiveAllSessions={() => void actions.archiveAllSessions()}
          onMarkSessionRead={(sessionId) => void actions.markSessionRead(sessionId)}
          onMarkSessionUnread={(sessionId) => void actions.markSessionUnread(sessionId)}
          onMarkAllSessionsRead={(sessionIds) => void actions.markAllSessionsRead(sessionIds)}
          onReorderSessions={(input) => void actions.reorderSessions(input)}
          onRevealWorkspace={(workspacePath) => void actions.revealWorkspaceInFileManager(workspacePath)}
          onDeleteSession={(sessionId) => void actions.deleteSession(sessionId)}
          onOpenWorkspace={actions.openWorkspace}
          onTriggerCreateWorkspace={handleTriggerCreateWorkspace}
        /></ErrorBoundary>

        <ErrorBoundary><CenterPane
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
          gitSnapshot={gitSnapshot}
          gitBranches={gitBranches}
          recentWorkspaces={recentWorkspaces}
          onSendMessage={async (content, opts) => {
            await actions.sendMessage(content, { mode: opts.mode, chips: opts.chips });
          }}
          onCancelGenerate={() => void actions.cancelActiveStream()}
          onOpenWorkspace={actions.openWorkspace}
          onTriggerCreateWorkspace={handleTriggerCreateWorkspace}
          onClearWorkspaceContext={actions.clearWorkspaceContext}
          onPickWorkspaceDirectory={actions.pickWorkspaceDirectory}
          onCreateSession={() => setNewSessionDialogOpen(true)}
          onDecideApproval={(approvalId, decision) => void actions.decideApproval(approvalId, decision)}
          onSelectModel={handleSelectModel}
          onRefreshGitBranches={actions.fetchGitBranches}
          onSwitchGitBranch={actions.switchGitBranch}
          onCreateGitBranch={actions.createGitBranch}
        /></ErrorBoundary>

        <ErrorBoundary><RightPanel
          t={t}
          appInfo={appInfo}
          collapsed={rightCollapsed}
          editorTabs={mergedTabs}
          selectedFilePath={selectedFilePath}
          selectedChangePreviewPath={selectedChangePreviewPath}
          changePreview={changePreview}
          changePreviewLoading={changePreviewLoading}
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
          onOpenFile={(path) => void actions.openFile(path)}
          onOpenChangePreview={(path) => void actions.openChangePreview(path)}
          onOpenFileAtLine={handleOpenFileAtLine}
          onReloadExternal={handleReloadExternal}
          onCreateWorkspaceFile={actions.createWorkspaceFile}
          onCreateWorkspaceFolder={actions.createWorkspaceFolder}
          onEditorChange={handleStandardEditorChange}
          onEditorMount={handleEditorMount}
          onDiffMount={handleDiffMount}
          onSearch={handleSearchSubmit}
          onSearchChange={setLocalSearchQuery}
          onRefreshWorkspaceTree={() => void actions.refreshWorkspaceTree()}
          onSendSelection={() => void handleSendSelection()}
          onSetDiffLayout={persistDiffLayout}
          activePatchSet={activePatchSet}
          latestPatchApplication={latestPatchApplication}
          selectedPatchFilePath={selectedPatchFilePath}
          selectedPatchHunkId={selectedPatchHunkId}
          collapsedPatchHunkIds={collapsedPatchHunkIds}
          patchReviewFilter={patchReviewFilter}
          onSetHunkDecision={handleSetHunkDecision}
          onApplyPatchSet={handleApplyPatch}
          onRollbackPatchSet={handleRollbackPatch}
          onAcceptAllHunks={() => void actions.acceptAllHunks()}
          onRejectAllHunks={() => void actions.rejectAllHunks()}
          onSelectPatchFile={handleSelectPatchFile}
          onSelectPatchHunk={handleSelectPatchHunk}
          onTogglePatchHunkCollapse={handleTogglePatchHunkCollapse}
          onSetAllPatchHunksCollapsed={handleSetAllPatchHunksCollapsed}
          onSetPatchReviewFilter={setPatchReviewFilter}
          onJumpPatchHunk={handleJumpPatchHunk}
          modelHealth={modelHealth}
          onRefreshModelHealth={() => void actions.refreshModelHealth()}
          onChangeSetting={handleChangeSetting}
          latestCommandRun={latestCommandRun}
        /></ErrorBoundary>
      </div>

      <CreateWorkspaceModal
        open={createWorkspaceModalOpen}
        t={t}
        onPickWorkspaceDirectory={actions.pickWorkspaceDirectory}
        onOpenWorkspace={actions.openWorkspace}
        onClose={() => setCreateWorkspaceModalOpen(false)}
      />

      <NewSessionDialog
        open={newSessionDialogOpen}
        t={t}
        onCreate={async (name) => {
          await actions.createSession();
          if (name) {
            const currentId = useAppStore.getState().activeSessionId;
            if (currentId) await actions.renameSession(currentId, name);
          }
          setNewSessionDialogOpen(false);
        }}
        onCancel={() => setNewSessionDialogOpen(false)}
      />

    </main>
  );
}
