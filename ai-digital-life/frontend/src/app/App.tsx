import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppInfo } from '@ai-digital-life/kernel';
import { useAppStore } from './stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { useAppActions } from './hooks/useAppActions';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAppZoom, ZOOM_STEP } from './hooks/useAppZoom';
import { useDragDropWorkspace } from './hooks/useDragDropWorkspace';
import { useAppStartup } from './hooks/useAppStartup';
import { usePatchReviewWithEditor } from './hooks/usePatchReviewWithEditor';
import { TitleBar } from './regions/TitleBar';
import { TCopyProvider } from './i18n';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LeftSidebar } from './regions/LeftSidebar';
import { CenterPane } from './regions/CenterPane';
const RightPanel = lazy(() =>
  import('./regions/RightPanel').then((m) => ({ default: m.RightPanel })),
);
import { CreateWorkspaceModal } from './components/CreateWorkspaceModal';
import { EnvWizard } from './features/environment/EnvWizard';
import { ToastContainer } from './components/Toast';
import { ToastRegion } from './components/ToastRegion';
import { ConflictModal } from './components/ConflictModal';
import { StartupOverlayWrapper } from './components/StartupOverlayWrapper';

export function App() {
  const errorToasts = useAppStore((state) => state.errorToasts);
  const { appInfo, leftCollapsed, leftbarWidth, rightCollapsed, rightPanelWidth } = useAppStore(
    useShallow((state) => ({
      appInfo: state.appInfo,
      leftCollapsed: state.leftCollapsed,
      leftbarWidth: state.leftbarWidth,
      rightCollapsed: state.rightCollapsed,
      rightPanelWidth: state.rightPanelWidth,
    })),
  );
  const actions = useAppActions();
  const navigateRightTool = useAppStore((s) => s.navigateRightTool);
  const toasts = useAppStore((s) => s.toasts);
  const removeToast = useAppStore((s) => s.removeToast);
  const dismissErrorToast = useAppStore((s) => s.dismissErrorToast);
  const clearErrorToasts = useAppStore((s) => s.clearErrorToasts);
  const notifications = useAppStore((s) => s.notifications);
  const activePopupId = useAppStore((s) => s.activePopupId);
  const dismissPopup = useAppStore((s) => s.dismissPopup);
  const fileOpNotices = useAppStore((s) => s.fileOpNotices);
  const dismissFileOpNotice = useAppStore((s) => s.dismissFileOpNotice);
  const resolveFileConflict = useAppStore((s) => s.resolveFileConflict);
  const appReady = useAppStore((s) => s.appReady);

  const activeNotification = useMemo(
    () => notifications.find((n) => n.id === activePopupId),
    [notifications, activePopupId],
  );

  useDragDropWorkspace(actions);

  const { locale, t } = useAppStartup(appInfo);

  // All hooks MUST be called unconditionally (React Hooks Rule).
  const patchReview = usePatchReviewWithEditor();
  const {
    standardEditorRef,
    selectedPatchFilePath,
    selectedPatchHunkId,
    collapsedPatchHunkIds,
    patchReviewFilter,
    handleOpenFileAtLine,
    handleDiffMount,
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
    [actions],
  );

  const [createWorkspaceModalOpen, setCreateWorkspaceModalOpen] = useState(false);
  const [isOpeningWorkspace, setIsOpeningWorkspace] = useState(false);

  const handleTriggerCreateWorkspace = useCallback(() => {
    setCreateWorkspaceModalOpen(true);
  }, []);

  const handleOpenFolder = useCallback(() => {
    void actions.pickWorkspaceDirectory().then(async (picked) => {
      if (picked) {
        setIsOpeningWorkspace(true);
        try {
          await actions.openWorkspace(picked);
        } catch {
          // openWorkspace 内部会 captureError；此处仅保证 loading 复位
        } finally {
          setIsOpeningWorkspace(false);
        }
      }
    });
  }, [actions]);

  const handleOpenSettings = useCallback(() => {
    navigateRightTool('settings');
  }, [navigateRightTool]);

  const handleOpenShortcutsSettings = useCallback(() => {
    const state = useAppStore.getState();
    state.navigateRightTool('settings');
    state.setActiveSettingsGroup('shortcuts');
  }, []);

  const { zoomBy, resetZoom } = useAppZoom();

  useKeyboardShortcuts({
    openCreateWorkspaceDialog: () => setCreateWorkspaceModalOpen(true),
    openWorkspace: handleOpenFolder,
    openSettings: handleOpenSettings,
    openShortcutsSettings: handleOpenShortcutsSettings,
    openFilesView: () => navigateRightTool('files'),
    openChangesView: () => navigateRightTool('changes'),
    openBrowserView: () => navigateRightTool('browser'),
    openTerminalView: () => navigateRightTool('terminal'),
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(-ZOOM_STEP),
    resetZoom,
  });

  const setStartupOverlayHidden = useAppStore((s) => s.setStartupOverlayHidden);
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

  // 同步 overlayHidden 到 UI store，供 BrowserPanel 纳入 hasOverlayActive 计算
  // 确保启动覆盖层显示期间 WebView2 保持离屏
  useEffect(() => {
    setStartupOverlayHidden(overlayHidden);
  }, [overlayHidden, setStartupOverlayHidden]);

  // 启动自检（事项 5）：每次启动先兑现“下次启动生效”（落盘 + 静默重启），
  // 再静默拉一次 dsh 版本状态（含预发布通道）；只写 store 供设置项内徽章/行提示
  // 展示，不弹 toast、不记错误卡片。串行是刻意的：自检读到的徽章/来源才是兑现后
  // 的终态，避免先自检旧源再被兑现刷新导致的闪烁（R1-Medium）。
  // Task 8 追加：同串行内再静默拉一次 env 全量状态，随后判定首启向导
  //（`!envWizardDone` 才展示；overlayHidden 逻辑外独立 showEnvWizard，避免闪烁）。
  const fetchDshVersionStatus = useAppStore((s) => s.fetchDshVersionStatus);
  const applyPendingVersionSource = useAppStore((s) => s.applyPendingVersionSource);
  const fetchEnvStatus = useAppStore((s) => s.fetchEnvStatus);
  const envWizardDone = useAppStore((s) => s.envWizardDone);
  const envWizardRequestId = useAppStore((s) => s.envWizardRequestId);
  const [envWizardResolved, setEnvWizardResolved] = useState(false);
  const [showEnvWizard, setShowEnvWizard] = useState(false);
  useEffect(() => {
    void (async () => {
      await applyPendingVersionSource();
      await fetchDshVersionStatus(true);
      await fetchEnvStatus(true);
      setEnvWizardResolved(true);
    })();
  }, [fetchDshVersionStatus, applyPendingVersionSource, fetchEnvStatus]);

  // 首启向导展示：串行自检完成后，若引导未完成则打开；设置组 resume 横幅把
  // envWizardDone 置回 false 即可重新打开（向导关闭恒落盘 done=true）。
  useEffect(() => {
    if (envWizardResolved && !envWizardDone) {
      setShowEnvWizard(true);
    }
  }, [envWizardResolved, envWizardDone]);

  // 「继续向导」nonce：done 已为 false 时单纯置 false 无状态变化，必须由
  // requestEnvWizard() 自增的序号驱动重新打开（含 goManualPath 已写 done=true 的场景）。
  useEffect(() => {
    if (envWizardResolved && envWizardRequestId > 0) {
      setShowEnvWizard(true);
    }
  }, [envWizardResolved, envWizardRequestId]);

  // Guard: wait for i18n before rendering (safe to return after all hooks)
  if (!t) {
    return (
      <>
        <div className="adl-shell adl-ide" />
        <StartupOverlayWrapper visible={!overlayHidden} />
      </>
    );
  }

  return (
    <ErrorBoundary
      t={t}
      fallback={
        <div
          className="adl-error-boundary"
          role="alert"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px',
            gap: '12px',
            color: 'var(--text-secondary, #888)',
            fontSize: '13px',
            textAlign: 'center',
            height: '100vh',
          }}
        >
          <p>{t.appCrashFallback}</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: 'var(--surface-hover, #333)',
              color: 'var(--text-primary, #fff)',
              border: '1px solid var(--border, #444)',
              borderRadius: '6px',
              padding: '6px 16px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            {t.appCrashReload}
          </button>
        </div>
      }
    >
      <TCopyProvider t={t} locale={locale}>
        <main className="adl-shell adl-ide">
          <TitleBar
            appInfo={appInfo}
            onOpenSettings={handleOpenSettings}
            onTriggerCreateWorkspace={handleTriggerCreateWorkspace}
            onOpenFolder={handleOpenFolder}
            isOpeningWorkspace={isOpeningWorkspace}
            onCycleTheme={handleCycleTheme}
            onSelectLanguage={handleSelectLanguage}
          />

          <div
            className={`adl-shell__body${leftCollapsed ? ' is-left-collapsed' : ''}${rightCollapsed ? ' is-right-collapsed' : ''}`}
            style={
              {
                '--leftbar-width': `${leftbarWidth}px`,
                '--rightpanel-width': `${rightPanelWidth}px`,
              } as React.CSSProperties
            }
          >
            <ErrorBoundary t={t}>
              <LeftSidebar collapsed={leftCollapsed} />
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
        </main>
        <ToastContainer toasts={toasts} onRemove={removeToast} />
        <ToastRegion
          errorToasts={errorToasts}
          onDismissError={dismissErrorToast}
          onClearAllError={clearErrorToasts}
          notices={fileOpNotices}
          onDismissNotice={dismissFileOpNotice}
          onResolveConflict={resolveFileConflict}
        />
        {activeNotification && (
          <ConflictModal notification={activeNotification} onDismiss={dismissPopup} />
        )}
        {showEnvWizard && <EnvWizard onClose={() => setShowEnvWizard(false)} />}
      </TCopyProvider>
      <StartupOverlayWrapper visible={!overlayHidden} />
    </ErrorBoundary>
  );
}
