import React, { lazy, Suspense, useCallback, useState } from 'react';
import type { AppInfo } from '@ai-digital-life/kernel';
import { useAppStore } from './stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { useAppActions } from './hooks/useAppActions';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useDragDropWorkspace } from './hooks/useDragDropWorkspace';
import { useAppStartup } from './hooks/useAppStartup';
import { usePatchReviewWithEditor } from './hooks/usePatchReviewWithEditor';
import { TitleBar } from './regions/TitleBar';
import { TCopyProvider } from './i18n';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LeftSidebar } from './regions/LeftSidebar';
import { CenterPane } from './regions/CenterPane';
const RightPanel = lazy(() =>
  import('./regions/RightPanel').then((m) => ({ default: m.RightPanel }))
);
import { NewSessionDialog } from './components/NewSessionDialog';
import { CreateWorkspaceModal } from './components/CreateWorkspaceModal';
import { asSessionID } from '../shared/branded';

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
  const setActiveRightTool = useAppStore((s) => s.setActiveRightTool);

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
    setActiveRightTool('settings');
  }, [setActiveRightTool]);

  const handleOpenCommandPalette = useCallback(() => {
    setActiveRightTool('files');
  }, [setActiveRightTool]);

  const activeSessionId = useAppStore((s) => s.activeSessionId);

  return (
    <TCopyProvider t={t} locale={locale}>
      <main className="adl-shell adl-ide">
        <TitleBar
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
              collapsed={leftCollapsed}
              onCreateSession={() => setNewSessionDialogOpen(true)}
              onTriggerCreateWorkspace={handleTriggerCreateWorkspace}
            />
          </ErrorBoundary>

          <ErrorBoundary>
            <CenterPane />
          </ErrorBoundary>

          <ErrorBoundary>
            <Suspense fallback={<div className="skeleton" style={{ flex: 1 }} />}>
              <RightPanel
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
            </Suspense>
          </ErrorBoundary>
        </div>

        <CreateWorkspaceModal
          open={createWorkspaceModalOpen}
          onPickWorkspaceDirectory={actions.pickWorkspaceDirectory}
          onOpenWorkspace={actions.openWorkspace}
          onClose={() => setCreateWorkspaceModalOpen(false)}
        />

        <NewSessionDialog
          open={newSessionDialogOpen}
          onCreate={async (name) => {
            await actions.createSession();
            if (name) {
              const currentId = activeSessionId;
              if (currentId) {
                await actions.renameSession(asSessionID(currentId), name);
              }
            }
            setNewSessionDialogOpen(false);
          }}
          onCancel={() => setNewSessionDialogOpen(false)}
        />
      </main>
    </TCopyProvider>
  );
}
