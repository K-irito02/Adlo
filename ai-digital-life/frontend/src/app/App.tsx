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
import { TitleBar } from "./regions/TitleBar";
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
} from "./regions/right-panel/patchReview";
import { isTauriShell } from "../tauri-bridge";

function readDiffSideBySidePreference(): boolean {
  try {
    return window.localStorage.getItem(DIFF_LAYOUT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function App() {
  const {
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
    bootstrap,
    openWorkspace,
    clearWorkspaceContext,
    pickWorkspaceDirectory,
    createSession,
    selectSession,
    renameSession,
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
    openChangePreview,
    createWorkspaceFile,
    createWorkspaceFolder,
    refreshWorkspaceTree,
    searchFiles,
    setHunkDecision,
    applyPatchSet,
    rollbackPatchSet,
    acceptAllHunks,
    rejectAllHunks,
    refreshTaskCenter,
    decideApproval,
    markExternalFileChange,
    notifyEditorBufferDirty,
    runCommand,
    refreshModelHealth,
    updatePreferences,
    fetchGitBranches,
    switchGitBranch,
    createGitBranch
  } = useAppStore(
    useShallow((state) => ({
      error: state.error,
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
      bootstrap: state.bootstrap,
      openWorkspace: state.openWorkspace,
      clearWorkspaceContext: state.clearWorkspaceContext,
      pickWorkspaceDirectory: state.pickWorkspaceDirectory,
      createSession: state.createSession,
      selectSession: state.selectSession,
      renameSession: state.renameSession,
      pinSession: state.pinSession,
      unpinSession: state.unpinSession,
      markSessionRead: state.markSessionRead,
      markSessionUnread: state.markSessionUnread,
      archiveSession: state.archiveSession,
      archiveAllSessions: state.archiveAllSessions,
      pinWorkspace: state.pinWorkspace,
      unpinWorkspace: state.unpinWorkspace,
      removeWorkspaceFromSidebar: state.removeWorkspaceFromSidebar,
      reorderWorkspaces: state.reorderWorkspaces,
      reorderSessions: state.reorderSessions,
      markAllSessionsRead: state.markAllSessionsRead,
      revealWorkspaceInFileManager: state.revealWorkspaceInFileManager,
      deleteSession: state.deleteSession,
      sendMessage: state.sendMessage,
      cancelActiveStream: state.cancelActiveStream,
      streamingAssistantText: state.streamingAssistantText,
      streamingActiveRunId: state.streamingActiveRunId,
      runActivityByRunId: state.runActivityByRunId,
      runUsageByRunId: state.runUsageByRunId,
      openFile: state.openFile,
      openChangePreview: state.openChangePreview,
      createWorkspaceFile: state.createWorkspaceFile,
      createWorkspaceFolder: state.createWorkspaceFolder,
      refreshWorkspaceTree: state.refreshWorkspaceTree,
      searchFiles: state.searchFiles,
      setHunkDecision: state.setHunkDecision,
      applyPatchSet: state.applyPatchSet,
      rollbackPatchSet: state.rollbackPatchSet,
      acceptAllHunks: state.acceptAllHunks,
      rejectAllHunks: state.rejectAllHunks,
      refreshTaskCenter: state.refreshTaskCenter,
      decideApproval: state.decideApproval,
      markExternalFileChange: state.markExternalFileChange,
      notifyEditorBufferDirty: state.notifyEditorBufferDirty,
      runCommand: state.runCommand,
      refreshModelHealth: state.refreshModelHealth,
      updatePreferences: state.updatePreferences,
      fetchGitBranches: state.fetchGitBranches,
      switchGitBranch: state.switchGitBranch,
      createGitBranch: state.createGitBranch
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
        void pickWorkspaceDirectory().then((picked) => {
          if (picked) void openWorkspace(picked);
        });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openWorkspace, pickWorkspaceDirectory]);

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
              void openWorkspace(path);
              return;
            }
            void openWorkspace(file.name);
            return;
          }
        }
      }
      const file = items[0].getAsFile();
      if (file) {
        const path = (file as File & { path?: string }).path;
        if (path) {
          void openWorkspace(path);
        }
      }
    };

    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("drop", handleDrop);
    return () => {
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("drop", handleDrop);
    };
  }, [openWorkspace]);

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
    await sendMessage(buildSelectionPrompt(locale, selectedFilePath, selectedText));
  }, [locale, selectedFilePath, sendMessage, t.noSelection]);

  const handleOpenFileAtLine = useCallback(
    (relativePath: string, line: number) => {
      pendingRevealRef.current = { path: relativePath, line };
      void openFile(relativePath);
    },
    [openFile]
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
        void openFile(relativePath);
      }
    },
    [activePatchSet, openFile, setActiveTool]
  );

  const handleSelectPatchHunk = useCallback(
    (relativePath: string, hunkId: string, line: number, options?: { activateTool?: boolean }) => {
      setSelectedPatchFilePath(relativePath);
      setSelectedPatchHunkId(hunkId);
      pendingRevealRef.current = { path: relativePath, line };
      if (options?.activateTool) {
        setActiveTool("files");
        void openFile(relativePath);
      }
    },
    [openFile, setActiveTool]
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
    void updatePreferences({ themeMode: next });
  }, [appInfo?.config.themeMode, updatePreferences]);

  const handleSelectLanguage = useCallback(
    (language: AppInfo["config"]["language"]) => {
      void updatePreferences({ language });
    },
    [updatePreferences]
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

      void updatePreferences({ modelPreferences: patch });
    },
    [updatePreferences]
  );

  const [createWorkspaceModalOpen, setCreateWorkspaceModalOpen] = useState(false);
  const [newSessionDialogOpen, setNewSessionDialogOpen] = useState(false);

  const handleTriggerCreateWorkspace = useCallback(() => {
    setCreateWorkspaceModalOpen(true);
  }, []);

  const handleOpenFolder = useCallback(() => {
    void pickWorkspaceDirectory().then((picked) => {
      if (picked) void openWorkspace(picked);
    });
  }, [openWorkspace, pickWorkspaceDirectory]);

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
    (editor: EditorRef) => {
      standardEditorRef.current = editor;
    },
    []
  );

  const handleDiffMount = useCallback((editor: EditorRef | DiffEditorRef) => {
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
          onCreateSession={() => setNewSessionDialogOpen(true)}
          onPinWorkspace={(workspaceId) => void pinWorkspace(workspaceId)}
          onUnpinWorkspace={(workspaceId) => void unpinWorkspace(workspaceId)}
          onRemoveWorkspace={(workspaceId) => void removeWorkspaceFromSidebar(workspaceId)}
          onReorderWorkspaces={(input) => void reorderWorkspaces(input)}
          onPinSession={(sessionId) => void pinSession(sessionId)}
          onUnpinSession={(sessionId) => void unpinSession(sessionId)}
          onRenameSession={(sessionId, title) => void renameSession(sessionId, title)}
          onArchiveSession={(sessionId) => void archiveSession(sessionId)}
          onArchiveAllSessions={() => void archiveAllSessions()}
          onMarkSessionRead={(sessionId) => void markSessionRead(sessionId)}
          onMarkSessionUnread={(sessionId) => void markSessionUnread(sessionId)}
          onMarkAllSessionsRead={(sessionIds) => void markAllSessionsRead(sessionIds)}
          onReorderSessions={(input) => void reorderSessions(input)}
          onRevealWorkspace={(workspacePath) => void revealWorkspaceInFileManager(workspacePath)}
          onDeleteSession={(sessionId) => void deleteSession(sessionId)}
          onOpenWorkspace={openWorkspace}
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
          gitSnapshot={gitSnapshot}
          gitBranches={gitBranches}
          recentWorkspaces={recentWorkspaces}
          onSendMessage={async (content, opts) => {
            await sendMessage(content, { mode: opts.mode, chips: opts.chips });
          }}
          onCancelGenerate={() => void cancelActiveStream()}
          onOpenWorkspace={openWorkspace}
          onTriggerCreateWorkspace={handleTriggerCreateWorkspace}
          onClearWorkspaceContext={clearWorkspaceContext}
          onPickWorkspaceDirectory={pickWorkspaceDirectory}
          onCreateSession={() => setNewSessionDialogOpen(true)}
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
          onOpenFile={(path) => void openFile(path)}
          onOpenChangePreview={(path) => void openChangePreview(path)}
          onOpenFileAtLine={handleOpenFileAtLine}
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
          selectedPatchFilePath={selectedPatchFilePath}
          selectedPatchHunkId={selectedPatchHunkId}
          collapsedPatchHunkIds={collapsedPatchHunkIds}
          patchReviewFilter={patchReviewFilter}
          onSetHunkDecision={handleSetHunkDecision}
          onApplyPatchSet={handleApplyPatch}
          onRollbackPatchSet={handleRollbackPatch}
          onAcceptAllHunks={() => void acceptAllHunks()}
          onRejectAllHunks={() => void rejectAllHunks()}
          onSelectPatchFile={handleSelectPatchFile}
          onSelectPatchHunk={handleSelectPatchHunk}
          onTogglePatchHunkCollapse={handleTogglePatchHunkCollapse}
          onSetAllPatchHunksCollapsed={handleSetAllPatchHunksCollapsed}
          onSetPatchReviewFilter={setPatchReviewFilter}
          onJumpPatchHunk={handleJumpPatchHunk}
          modelHealth={modelHealth}
          onRefreshModelHealth={() => void refreshModelHealth()}
          onChangeSetting={handleChangeSetting}
          latestCommandRun={latestCommandRun}
        />
      </div>

      <CreateWorkspaceModal
        open={createWorkspaceModalOpen}
        t={t}
        onPickWorkspaceDirectory={pickWorkspaceDirectory}
        onOpenWorkspace={openWorkspace}
        onClose={() => setCreateWorkspaceModalOpen(false)}
      />

      <NewSessionDialog
        open={newSessionDialogOpen}
        t={t}
        onCreate={async (name) => {
          await createSession();
          if (name) {
            const currentId = useAppStore.getState().activeSessionId;
            if (currentId) await renameSession(currentId, name);
          }
          setNewSessionDialogOpen(false);
        }}
        onCancel={() => setNewSessionDialogOpen(false)}
      />

    </main>
  );
}
