import React, { useCallback, useState } from 'react';
import type { AppInfo } from '@ai-digital-life/kernel';
import { useAppStore } from './stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { useAppActions } from './hooks/useAppActions';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useDragDropWorkspace } from './hooks/useDragDropWorkspace';
import { useAppStartup } from './hooks/useAppStartup';
import { usePatchReviewWithEditor } from './hooks/usePatchReviewWithEditor';
import { TitleBar } from './regions/TitleBar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LeftSidebar } from './regions/LeftSidebar';
import { CenterPane } from './regions/CenterPane';
import { RightPanel } from './regions/RightPanel';
import { NewSessionDialog } from './components/NewSessionDialog';
import { CreateWorkspaceModal } from './components/CreateWorkspaceModal';

export function App() {
  const error = useAppStore((state) => state.error);
  const { appInfo, leftCollapsed, rightCollapsed, rightPanelWidth } = useAppStore(
    useShallow((state) => ({
      appInfo: state.appInfo,
      leftCollapsed: state.leftCollapsed,
      rightCollapsed: state.rightCollapsed,
      rightPanelWidth: state.rightPanelWidth,
    }))
  );
  const actions = useAppActions();

  useDragDropWorkspace(actions);

  const { locale, t } = useAppStartup(appInfo);
  const {
    standardEditorRef,
    selectedPatchFilePath,
    selectedPatchHunkId,
    collapsedPatchHunkIds,
    patchReviewFilter,
    handleOpenFileAtLine,
    handleDiffMount,
    handleSendSelection,
    handleSelectPatchFile,
    handleSelectPatchHunk,
    handleTogglePatchHunkCollapse,
    handleSetAllPatchHunksCollapsed,
    setPatchReviewFilter,
    handleJumpPatchHunk,
  } = usePatchReviewWithEditor(locale);

  const handleCycleTheme = useCallback(() => {
    const mode = appInfo?.config.themeMode ?? 'system';
    const next: AppInfo['config']['themeMode'] =
      mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system';
    void actions.updatePreferences({ themeMode: next });
  }, [appInfo?.config.themeMode, actions]);

  const handleSelectLanguage = useCallback(
    (language: AppInfo['config']['language']) => {
      void actions.updatePreferences({ language });
    },
    [actions]
  );

  const [createWorkspaceModalOpen, setCreateWorkspaceModalOpen] = useState(false);
  const [newSessionDialogOpen, setNewSessionDialogOpen] = useState(false);

  useKeyboardShortcuts(setNewSessionDialogOpen, setCreateWorkspaceModalOpen);

  const handleTriggerCreateWorkspace = useCallback(() => {
    setCreateWorkspaceModalOpen(true);
  }, []);

  const handleOpenFolder = useCallback(() => {
    void actions.pickWorkspaceDirectory().then((picked) => {
      if (picked) {
        void actions.openWorkspace(picked);
      }
    });
  }, [actions]);

  const handleOpenSettings = useCallback(() => {
    useAppStore.getState().setActiveRightTool('settings');
  }, []);

  const handleOpenCommandPalette = useCallback(() => {
    useAppStore.getState().setActiveRightTool('files');
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
        className={`adl-shell__body${leftCollapsed ? ' is-left-collapsed' : ''}${rightCollapsed ? ' is-right-collapsed' : ''}`}
        style={{ '--rightpanel-width': `${rightPanelWidth}px` } as React.CSSProperties}
      >
        <ErrorBoundary>
          <LeftSidebar
            t={t}
            collapsed={leftCollapsed}
            onCreateSession={() => setNewSessionDialogOpen(true)}
            onTriggerCreateWorkspace={handleTriggerCreateWorkspace}
          />
        </ErrorBoundary>

        <ErrorBoundary>
          <CenterPane t={t} />
        </ErrorBoundary>

        <ErrorBoundary>
          <RightPanel
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
          />
        </ErrorBoundary>
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
            if (currentId) {
              await actions.renameSession(currentId, name);
            }
          }
          setNewSessionDialogOpen(false);
        }}
        onCancel={() => setNewSessionDialogOpen(false)}
      />
    </main>
  );
}
