import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { AppInfo } from "@ai-digital-life/kernel";
import { copy, type Locale } from "./copy";
import { buildSelectionPrompt } from "./selectionPrompt";
import { themeController } from "./theme";
import type { EditorRef, DiffEditorRef } from "./types";
import { filterDiagnosticsForPath, findFirstDiagnostic } from "./workspacePaths";
import { useAppStore } from "./stores/slicedStore";
import { useUiStore } from "./ui-store";
import { useAppActions } from "./hooks/useAppActions";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
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

export function App() {
  const error = useAppStore((state) => state.error);
  const appInfo = useAppStore((s) => s.appInfo);
  const activePatchSet = useAppStore(useShallow((s) => s.activePatchSet));
  const selectedFilePath = useAppStore((s) => s.selectedFilePath);
  const latestPatchApplication = useAppStore(useShallow((s) => s.latestPatchApplication));
  const fileLastModifiedAt = useAppStore((s) => s.fileLastModifiedAt);
  const actions = useAppActions();

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
  const [editorHint, setEditorHint] = React.useState<string>();
  const [selectedPatchFilePath, setSelectedPatchFilePath] = useState<string>();
  const [selectedPatchHunkId, setSelectedPatchHunkId] = useState<string>();
  const [collapsedPatchHunkIds, setCollapsedPatchHunkIds] = useState<string[]>([]);
  const [patchReviewFilter, setPatchReviewFilter] = useState<PatchReviewFilter>("all");
  const standardEditorRef = useRef<EditorRef | null>(null);
  const diffEditorRef = useRef<EditorRef | DiffEditorRef | null>(null);
  const pendingRevealRef = useRef<{ path: string; line: number } | null>(null);

  const locale = (appInfo?.config.language ?? "zh-CN") as Locale;
  const t = copy[locale];

  useEffect(() => {
    void window.digitalLife.window.setTitle(t.brandHoverName);
  }, [t.brandHoverName]);

  const validation = latestPatchApplication?.validation;
  const selectedDiagnostics = useMemo(
    () => filterDiagnosticsForPath(validation?.diagnostics ?? [], selectedFilePath),
    [selectedFilePath, validation?.diagnostics]
  );
  const activeDiagnostic = useMemo(() => findFirstDiagnostic(selectedDiagnostics), [selectedDiagnostics]);

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

  const [createWorkspaceModalOpen, setCreateWorkspaceModalOpen] = useState(false);
  const [newSessionDialogOpen, setNewSessionDialogOpen] = useState(false);

  useKeyboardShortcuts(setNewSessionDialogOpen, setCreateWorkspaceModalOpen);

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

  const handleOpenCommandPalette = useCallback(() => {
    // Command palette is planned for a future phase. For now, surface
    // the search tool as a graceful fallback.
    useUiStore.getState().setActiveTool("files");
  }, []);

  const handleDiffMount = useCallback((editor: EditorRef | DiffEditorRef) => {
    diffEditorRef.current = editor;
  }, []);

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
          collapsed={leftCollapsed}
          onCreateSession={() => setNewSessionDialogOpen(true)}
          onTriggerCreateWorkspace={handleTriggerCreateWorkspace}
        /></ErrorBoundary>

        <ErrorBoundary><CenterPane
          t={t}
        /></ErrorBoundary>

        <ErrorBoundary><RightPanel
          t={t}
          collapsed={rightCollapsed}
          standardEditorRef={standardEditorRef}
          selectedPatchFilePath={selectedPatchFilePath}
          selectedPatchHunkId={selectedPatchHunkId}
          collapsedPatchHunkIds={collapsedPatchHunkIds}
          patchReviewFilter={patchReviewFilter}
          onOpenFileAtLine={handleOpenFileAtLine}
          onDiffMount={handleDiffMount}
          onSendSelection={() => void handleSendSelection()}
          onSelectPatchFile={handleSelectPatchFile}
          onSelectPatchHunk={handleSelectPatchHunk}
          onTogglePatchHunkCollapse={handleTogglePatchHunkCollapse}
          onSetAllPatchHunksCollapsed={handleSetAllPatchHunksCollapsed}
          onSetPatchReviewFilter={setPatchReviewFilter}
          onJumpPatchHunk={handleJumpPatchHunk}
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
