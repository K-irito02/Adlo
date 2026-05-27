import React, { useCallback, useEffect, useRef, useState } from "react";
import type { AppInfo } from "@ai-digital-life/kernel";
import { copy, type Locale } from "./copy";
import { useAppStore } from "./stores/slicedStore";
import { useAppActions } from "./hooks/useAppActions";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useDragDropWorkspace } from "./hooks/useDragDropWorkspace";
import { usePatchReview } from "./hooks/usePatchReview";
import { useEditorReveal } from "./hooks/useEditorReveal";
import { useThemeSync } from "./hooks/useThemeSync";
import { useTaskCenterPolling } from "./hooks/useTaskCenterPolling";
import { TitleBar } from "./regions/TitleBar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LeftSidebar } from "./regions/LeftSidebar";
import { CenterPane } from "./regions/CenterPane";
import { RightPanel } from "./regions/RightPanel";
import { NewSessionDialog } from "./components/NewSessionDialog";
import { CreateWorkspaceModal } from "./components/CreateWorkspaceModal";

export function App() {
  const error = useAppStore((state) => state.error);
  const appInfo = useAppStore((s) => s.appInfo);
  const leftCollapsed = useAppStore((state) => state.leftCollapsed);
  const rightCollapsed = useAppStore((state) => state.rightCollapsed);
  const rightPanelWidth = useAppStore((state) => state.rightPanelWidth);
  const selectedFilePath = useAppStore((s) => s.selectedFilePath);
  const fileLastModifiedAt = useAppStore((s) => s.fileLastModifiedAt);
  const actions = useAppActions();

  useDragDropWorkspace(actions);

  const locale = (appInfo?.config.language ?? "zh-CN") as Locale;
  const t = copy[locale];

  const pendingRevealRef = useRef<{ path: string; line: number } | null>(null);
  const setPendingReveal = useCallback((path: string, line: number) => {
    pendingRevealRef.current = { path, line };
  }, []);

  const {
    selectedPatchFilePath,
    selectedPatchHunkId,
    collapsedPatchHunkIds,
    patchReviewFilter,
    setEditorHint,
    activeDiagnostic,
    setPatchReviewFilter,
    handleSelectPatchFile,
    handleSelectPatchHunk,
    handleTogglePatchHunkCollapse,
    handleSetAllPatchHunksCollapsed,
    handleJumpPatchHunk,
  } = usePatchReview(setPendingReveal);

  const {
    standardEditorRef,
    handleOpenFileAtLine,
    handleSendSelection,
    handleDiffMount,
  } = useEditorReveal(
    selectedFilePath,
    activeDiagnostic,
    fileLastModifiedAt,
    { sendMessage: actions.sendMessage, openFile: actions.openFile },
    locale,
    setEditorHint,
    pendingRevealRef,
    setPendingReveal,
  );

  useThemeSync(appInfo);
  useTaskCenterPolling(appInfo);

  useEffect(() => {
    void window.digitalLife.window.setTitle(t.brandHoverName);
  }, [t.brandHoverName]);

  useEffect(() => {
    void actions.bootstrap();
  }, [actions.bootstrap]);

  useEffect(() => {
    return window.digitalLife.workspace.onFileChanged((event) => {
      actions.markExternalFileChange(event);
    });
  }, [actions.markExternalFileChange]);

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
    useAppStore.getState().setActiveRightTool("settings");
  }, []);

  const handleOpenCommandPalette = useCallback(() => {
    useAppStore.getState().setActiveRightTool("files");
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
