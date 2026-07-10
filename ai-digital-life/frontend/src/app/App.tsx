import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
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
import { ToastContainer } from './components/Toast';
import { ConflictModal } from './components/ConflictModal';
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
  const toasts = useAppStore((s) => s.toasts);
  const removeToast = useAppStore((s) => s.removeToast);
  const notifications = useAppStore((s) => s.notifications);
  const activePopupId = useAppStore((s) => s.activePopupId);
  const dismissPopup = useAppStore((s) => s.dismissPopup);

  const activeNotification = useMemo(
    () => notifications.find((n) => n.id === activePopupId),
    [notifications, activePopupId]
  );

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

  useKeyboardShortcuts({
    openNewSessionDialog: () => setNewSessionDialogOpen(true),
    openCreateWorkspaceDialog: () => setCreateWorkspaceModalOpen(true),
    openWorkspace: handleOpenFolder,
    openSettings: handleOpenSettings,
  });

  const handleOpenCommandPalette = useCallback(() => {
    setActiveRightTool('files');
  }, [setActiveRightTool]);

  const activeSessionId = useAppStore((s) => s.activeSessionId);

  // TEMPORARY: mock notifications for UI/UX testing — remove after testing
  useEffect(() => {
    const addNotif = useAppStore.getState().addNotification;
    const t = Date.now();
    addNotif({
      type: 'conflict',
      title: '合并冲突',
      summary: '检测到 5 个文件的合并冲突，请解决后再切换分支',
      fullInfo: '冲突操作: Stash pop 恢复暂存变更\n从分支: feature/login\n切换到: main\n发生时间: 2026-07-10T12:00:00.000Z\n冲突文件:\n  - src/auth/login.tsx\n  - src/auth/LoginForm.tsx\n  - src/i18n/zh-CN/auth.ts\n  - src/styles/auth.css\n  - src/tests/auth.test.ts',
    });
    addNotif({
      type: 'conflict',
      title: '合并冲突',
      summary: '检测到 2 个文件的合并冲突',
      fullInfo: '冲突操作: Stash pop 恢复暂存变更\n从分支: fix/header\n切换到: main\n发生时间: 2026-07-10T12:05:00.000Z\n冲突文件:\n  - src/components/Header.tsx\n  - src/styles/header.css',
    });
    addNotif({
      type: 'conflict',
      title: '合并冲突',
      summary: '检测到 3 个文件的合并冲突',
      fullInfo: '冲突操作: Stash pop 恢复暂存变更\n从分支: feature/dashboard\n切换到: main\n发生时间: 2026-07-10T12:10:00.000Z\n冲突文件:\n  - src/pages/Dashboard.tsx\n  - src/components/Chart.tsx\n  - src/utils/dataProcessor.ts',
    });
    // Stagger timestamps for visual variety (recent → older)
    setTimeout(() => {
      useAppStore.setState((s) => ({
        notifications: s.notifications.map((n, i) => ({
          ...n,
          timestamp: t - i * 120000, // now, 2min ago, 4min ago
        })),
      }));
    }, 100);
  }, []);

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
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      {activeNotification && (
        <ConflictModal
          notification={activeNotification}
          onDismiss={dismissPopup}
        />
      )}
    </TCopyProvider>
  );
}
