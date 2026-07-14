import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppInfo } from '@ai-digital-life/kernel';
import type { CopyDict, Locale } from './i18n';
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
import { AnimatePresence, motion } from 'motion/react';
import StartupOverlay from './components/StartupOverlay';

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
  const appReady = useAppStore((s) => s.appReady);

  const activeNotification = useMemo(
    () => notifications.find((n) => n.id === activePopupId),
    [notifications, activePopupId]
  );

  useDragDropWorkspace(actions);

  const { locale, t } = useAppStartup(appInfo);

  // All hooks MUST be called unconditionally (React Hooks Rule).
  // Deconstruct after guard so downstream types are non-null.
  const patchReview = usePatchReviewWithEditor(
    (locale ?? 'zh-CN') as Locale,
    (t ?? {}) as CopyDict
  );
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
  } = patchReview;

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
  const [overlayHidden, setOverlayHidden] = useState(false);
  const startedAt = useRef(0);

  // 覆盖层超时逻辑
  const OVERLAY_MIN_MS = 3500;
  const OVERLAY_MAX_MS = 8000;

  // 最长 8s 超时强制退出
  useEffect(() => {
    startedAt.current = performance.now();
    const maxTimer = setTimeout(() => {
      setOverlayHidden(true);
    }, OVERLAY_MAX_MS);
    return () => clearTimeout(maxTimer);
  }, []);

  // appReady + 最短 3.5s 双条件
  useEffect(() => {
    if (!t || !appReady) {
      return;
    }
    const elapsed = performance.now() - startedAt.current;
    const remaining = Math.max(0, OVERLAY_MIN_MS - elapsed);
    const timer = setTimeout(() => {
      setOverlayHidden(true);
    }, remaining);
    return () => clearTimeout(timer);
  }, [t, appReady]);

  // Guard: wait for i18n before rendering (safe to return after all hooks)
  if (!t) {
    return (
      <>
        <div className="adl-shell adl-ide" />
        <AnimatePresence>
          {!overlayHidden && (
            <motion.div
              key="startup-overlay"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
            >
              <StartupOverlay />
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <>
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
            <ErrorBoundary t={t}>
              <LeftSidebar
                collapsed={leftCollapsed}
                onCreateSession={() => setNewSessionDialogOpen(true)}
                onTriggerCreateWorkspace={handleTriggerCreateWorkspace}
              />
            </ErrorBoundary>

            <ErrorBoundary t={t}>
              <CenterPane />
            </ErrorBoundary>

            <ErrorBoundary t={t}>
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
          <ConflictModal notification={activeNotification} onDismiss={dismissPopup} />
        )}
      </TCopyProvider>
      <AnimatePresence>
        {!overlayHidden && (
          <motion.div
            key="startup-overlay"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          >
            <StartupOverlay />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
