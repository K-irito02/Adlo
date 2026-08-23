import { useCallback, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { isTauriShell } from '@shared/env';
import { useBrowserTabs } from './useBrowserTabs';
import { useBrowserWebView } from './useBrowserWebView';
import { useBrowserSearch } from './useBrowserSearch';
import { useBrowserTreeActions } from './useBrowserTreeActions';
import { useBrowserNavigation } from './useBrowserNavigation';
import { useBrowserUrlState } from './useBrowserUrlState';
import { useBrowserMenus } from './useBrowserMenus';
import { useBrowserThemeSync } from './useBrowserThemeSync';
import type { BrowserPanelProps } from '@regions/right-panel/types';
import { useTCopy } from '@i18n/useTCopy';
import { buildBookmarkDirectoryTree } from './browserPanelHelpers';
import { useBrowserIframeState } from './useBrowserIframeState';
import { useBrowserNavigatorState } from './useBrowserNavigatorState';
import { useBrowserPanelMenuItems } from './useBrowserPanelMenuItems';
import { useBrowserPanelAddressSubmit } from './useBrowserPanelAddressSubmit';
import { useBrowserPanelCloseHandlers } from './useBrowserPanelCloseHandlers';
import { useBrowserPanelEffects } from './useBrowserPanelEffects';
import { useBrowserZoomState } from './useBrowserZoomState';
import { useBrowserDialogs } from './useBrowserDialogs';
import { useBrowserToast } from './useBrowserToast';
import { useBrowserPanelHandlers } from './useBrowserPanelHandlers';
import { useBrowserPanelMetaWiring } from './useBrowserPanelMetaWiring';
import { useBrowserNewTabSubscription } from './useBrowserNewTabSubscription';
import { BrowserPanelActionsCtx } from './BrowserPanelActionsContext';
import { BrowserPanelStateCtx } from './BrowserPanelStateContext';
import { useBrowserPanelActions } from './useBrowserPanelActions';
import { useBrowserPanelState } from './useBrowserPanelState';
import { BrowserShell } from './BrowserShell';

export function BrowserPanel(props: BrowserPanelProps) {
  const { t } = useTCopy();
  useBrowserThemeSync();

  const isBrowserVisible = props.isVisible ?? false;

  const {
    browserOpenTab,
    browserNavigateActiveTab,
    browserUpdateTab,
    browserBookmarks,
    browserHistory,
    setBrowserNavigateInPlace,
    browserNavigateInPlace,
    browserSelectTab,
    startupOverlayHidden,
  } = useAppStore(
    useShallow((state) => ({
      browserOpenTab: state.browserOpenTab,
      browserNavigateActiveTab: state.browserNavigateActiveTab,
      browserUpdateTab: state.browserUpdateTab,
      browserBookmarks: state.browserBookmarks,
      browserHistory: state.browserHistory,
      setBrowserNavigateInPlace: state.setBrowserNavigateInPlace,
      browserNavigateInPlace: state.browserNavigateInPlace,
      browserSelectTab: state.browserSelectTab,
      startupOverlayHidden: state.startupOverlayHidden,
    })),
  );

  const { toastMessages, showToast, removeToast } = useBrowserToast();

  // 经 useBrowserWebView 在每次 render 时赋值，供 navigateActiveTabExplicit 在
  // 显式导航时判断"目标 tab 的 WebView 是否已入池"并真正调用 Navigate。
  const navigationHelpersRef = useRef<{
    isTabInPool: (tabId: string) => boolean;
    navigateTabInPool: (tabId: string, url: string) => Promise<void>;
  }>({
    isTabInPool: () => false,
    navigateTabInPool: async () => {},
  });

  // 显式导航入口（地址栏回车、历史/书签树"在此标签打开"）。
  // 设计 D4：前端只在显式导航时才 navigate。被删的响应式反向导航分支已不再
  // 触发 Navigate（软导航/被动 URL 变化绝不整页重载——由 lifecycle 保证）。
  // 因此这里需在保留 store action 职责（更新 tab.url / 新建 tab）的同时，
  // 对"已入池 tab"显式补一次 navigateTabInPool（= WebView2.Navigate）。
  // 未入池/新建 tab 交由 lifecycle createWebViewForTab(tab.url) 创建并导航，
  // 池中无 WebView 时不要 navigate（会失败或 no-op）。
  const navigateActiveTabExplicit = useCallback(
    async (url: string, title?: string) => {
      const id = useAppStore.getState().browserActiveTabId;
      browserNavigateActiveTab(url, title);
      if (isTauriShell() && id && navigationHelpersRef.current.isTabInPool(id)) {
        await navigationHelpersRef.current.navigateTabInPool(id, url);
      }
    },
    [browserNavigateActiveTab],
  );

  // 标签感知的显式导航（D4）：活动标签走 navigateActiveTabExplicit；非活动标签
  // 更新其 URL 后直接 Navigate 其已入池 WebView（池外/新建交由 lifecycle 创建时导航）。
  // 供新建/编辑标签对话框"就地打开"、树"在当下标签打开"等显式入口复用，避免
  // store action 更新 URL 后 Tauri 下 WebView 停在旧页的双端分叉。
  const navigateTabExplicit = useCallback(
    async (tabId: string, url: string, title?: string) => {
      const s = useAppStore.getState();
      if (tabId === s.browserActiveTabId) {
        await navigateActiveTabExplicit(url, title);
      } else {
        s.browserUpdateTab(tabId, { url, ...(title ? { title } : {}) });
        if (isTauriShell() && navigationHelpersRef.current.isTabInPool(tabId)) {
          await navigationHelpersRef.current.navigateTabInPool(tabId, url);
        }
      }
    },
    [navigateActiveTabExplicit],
  );

  const activatedTabIdsRef = useRef(new Set<string>());

  const {
    activeTab,
    hasActiveTab,
    isBookmarked,
    browserTabs,
    handleDoubleClick,
    handleCloseTab,
    handleCloseAllTabs: _handleCloseAllTabs,
    handleClearTabDirectories: _handleClearTabDirectories,
  } = useBrowserTabs();

  const {
    iframeRef,
    activeTabRef,
    expectedNavigationUrlRef,
    validatedUrlsRef,
    iframeLoadError,
    setIframeLoadError,
    iframeBlockedDetected,
    setIframeBlockedDetected,
    iframeHistory,
    setIframeHistory,
    markUrlSeen,
    navigateBrowser,
  } = useBrowserIframeState({ activeTab });

  const {
    pendingNavigationsRef,
    handleNavigationStart,
    handleOpenTabFromTree,
    handleToggleNavigateMode,
    handleAlwaysNewTab,
    handlePointerDown,
  } = useBrowserPanelHandlers({
    browserOpenTab,
    browserNavigateActiveTab: navigateActiveTabExplicit,
    browserSelectTab,
    browserNavigateInPlace,
    setBrowserNavigateInPlace,
    expectedNavigationUrlRef,
  });

  const { zoomLevel, setZoomLevel } = useBrowserZoomState({ activeTabId: activeTab?.id });

  const {
    createTabDialog,
    handleSetCreateTabDialog,
    handleCreateTabConfirm,
    handleCreateTabCancel,
    isCreatingTab,
    editTabDialog,
    handleEditTab,
    handleEditTabConfirm,
    handleEditTabCancel,
    renameFolderState,
    setRenameFolderState,
    createDirDialog,
    setCreateDirDialog,
    bookmarkDialogOpen,
    setBookmarkDialogOpen,
    bookmarkName,
    setBookmarkName,
    handleOpenBookmarkDialog,
    handleBookmarkFromUrl,
    handleBookmarkAddToFolder,
    handleBookmarkCreateDir,
  } = useBrowserDialogs({
    browserOpenTab,
    browserUpdateTab,
    navigateTabExplicit,
    activeTab,
    isBookmarked,
    showToast,
    t,
  });

  const {
    navigatorQuery,
    setNavigatorQuery,
    searchScope,
    setSearchScope,
    navigatorSearchRef,
    navigatorSearchInputRef,
    searchResults,
    browserLookupIndex,
  } = useBrowserSearch({
    browserBookmarks,
    browserHistory,
    browserTabs,
  });

  const {
    navigatorMode,
    setNavigatorMode,
    address,
    setAddress,
    addressExpanded,
    setAddressExpanded,
    searchQueryDisplay,
    setSearchQueryDisplay,
    addressSearchRef,
    addressInputRef,
    selectedTreePath,
    selectedTreePathRef,
    handleSelectTreePath,
    submitVersionRef,
    addressSubmittedForTabRef,
  } = useBrowserNavigatorState({ navigatorSearchInputRef });

  const {
    browserTabFolders,
    tabTreeExpanded,
    allTreeExpanded,
    handleToggleTreePath,
    handleDeleteAllChildTabs,
    handleDeleteOwnChildTabs,
    handleOpenAllInNewTabs,
    handleRemoveFromArea,
    handleDeleteDirectory,
    handleDeleteHistoryLevel,
    handleExpandAllTree,
    handleCollapseAllTree,
    handleRefreshTab,
    handleDeleteTab,
    handleCopyTabLink,
    handleOpenTabInNewTab,
    handleOpenTabInCurrentTab,
    handleRemoveBookmarkTab,
  } = useBrowserTreeActions({ navigateTabExplicit });

  const {
    browserMenuOpen,
    setBrowserMenuOpen,
    browserMenuRef,
    contextMenu,
    handleTogglePin,
    handleCopyUrlFromMenu,
    handleOpenInNewTab,
    handleOpenInCurrentTab,
  } = useBrowserMenus({
    activeTab,
    handleCloseTab,
    handleDoubleClick,
  });

  const hasOverlayActive =
    !startupOverlayHidden ||
    createTabDialog.open ||
    editTabDialog.open ||
    bookmarkDialogOpen ||
    renameFolderState.open ||
    createDirDialog.open;

  const {
    primaryRef,
    removeFromPool,
    isTabInPool,
    navigateTabInPool,
    loadingTabId,
    poolVersion: _poolVersion,
  } = useBrowserWebView({
    activeTab,
    webViewDisabled: false,
    isVisible: isBrowserVisible,
    overlayActive: hasOverlayActive,
  });

  // render 期镜像最新 helper，供显式导航函数运行时读取
  navigationHelpersRef.current = { isTabInPool, navigateTabInPool };

  const { wrappedHandleCloseTab, handleCloseAllTabs, handleClearTabDirectories } =
    useBrowserPanelCloseHandlers({
      handleCloseTab,
      originalCloseAllTabs: _handleCloseAllTabs,
      originalClearTabDirectories: _handleClearTabDirectories,
      removeFromPool,
    });

  const {
    handleIframeLoad,
    handleIframeError,
    handlePageMeta: _handlePageMeta,
  } = useBrowserPanelMetaWiring({
    activeTab,
    activeTabRef,
    iframeRef,
    expectedNavigationUrlRef,
    pendingNavigationsRef,
    markUrlSeen,
    setAddress,
    setSearchQueryDisplay,
    setIframeLoadError,
    browserNavigateActiveTab,
    browserUpdateTab,
    onNavigationStart: handleNavigationStart,
  });

  const { handleGoBack, handleGoForward, handleReload, canGoBack, canGoForward } =
    useBrowserNavigation({
      iframeRef,
      iframeHistory,
      navigateBrowser,
      activeTabId: activeTab?.id,
    });

  const { browserMenuItems } = useBrowserPanelMenuItems({
    activeTab,
    hardReload: handleReload,
    zoomLevel,
    setZoomLevel,
    t,
  });

  useBrowserNewTabSubscription((url) => {
    browserOpenTab(url, undefined, undefined);
  });

  const { submitAddress } = useBrowserPanelAddressSubmit({
    address,
    setAddress,
    setSearchQueryDisplay,
    browserLookupIndex,
    handleNavigationStart,
    expectedNavigationUrlRef,
    navigateBrowser,
    browserNavigateActiveTab: navigateActiveTabExplicit,
    setIframeLoadError,
    setIframeBlockedDetected,
    handlePageMeta: _handlePageMeta,
    addressSubmittedForTabRef,
    submitVersionRef,
    validatedUrlsRef,
  });

  const activeTabUrl =
    addressSubmittedForTabRef.current === (activeTab?.url || 'about:blank')
      ? activeTab?.url === 'about:blank'
        ? ''
        : (activeTab?.url ?? '')
      : '';

  const urlState = useBrowserUrlState({
    address,
    addressExpanded,
    addressSearchRef,
    addressInputRef,
    setAddress,
    setAddressExpanded,
    searchQueryDisplay,
    setSearchQueryDisplay,
    submitAddress,
    activeTabUrl,
  });

  useBrowserPanelEffects({
    activeTab,
    addressSubmittedForTabRef,
    setAddress,
    setSearchQueryDisplay,
    setIframeHistory,
    browserMenuOpen,
    setBrowserMenuOpen,
    browserMenuRef,
    addressExpanded,
    setAddressExpanded,
    addressSearchRef,
    navigatorMode,
    setNavigatorMode,
    navigatorSearchRef,
  });

  const evictedTabIds = useMemo(() => {
    const result = new Set(browserTabs.filter((t) => !isTabInPool(t.id)).map((t) => t.id));
    if (activeTab?.id) {
      result.delete(activeTab.id);
    }
    return result;
  }, [browserTabs, activeTab?.id, isTabInPool]);

  const actionsValue = useBrowserPanelActions(
    {
      handleCloseTab: wrappedHandleCloseTab,
      handleCloseAllTabs,
      handleClearTabDirectories,
      handleDoubleClick,
      handleOpenBookmarkDialog,
      handleEditTab,
      handleSetCreateTabDialog,
      setCreateDirDialog,
      setRenameFolderState,
      setNavigatorQuery,
      setSearchScope,
      handleToggleTreePath,
      handleDeleteAllChildTabs,
      handleDeleteOwnChildTabs,
      handleOpenAllInNewTabs,
      handleRemoveFromArea,
      handleDeleteDirectory,
      handleDeleteHistoryLevel,
      handleExpandAllTree,
      handleCollapseAllTree,
      handleRefreshTab,
      handleDeleteTab,
      handleCopyTabLink,
      handleOpenTabInNewTab,
      handleOpenTabInCurrentTab,
      onBookmarkTab: handleBookmarkFromUrl,
      onRemoveBookmarkTab: handleRemoveBookmarkTab,
      setBrowserMenuOpen,
      handleOpenTabFromTree,
      handleIframeLoad,
      handleIframeError,
      handleGoBack,
      handleGoForward,
      handleReload,
      canGoBack,
      canGoForward,
      setNavigatorMode,
      handleSelectTreePath,
      showToast,
      handleToggleNavigateMode,
      handleAlwaysNewTab,
    },
    [
      wrappedHandleCloseTab,
      handleCloseAllTabs,
      handleClearTabDirectories,
      handleDoubleClick,
      handleOpenBookmarkDialog,
      handleEditTab,
      handleSetCreateTabDialog,
      setCreateDirDialog,
      setRenameFolderState,
      setNavigatorQuery,
      setSearchScope,
      handleToggleTreePath,
      handleDeleteAllChildTabs,
      handleDeleteOwnChildTabs,
      handleOpenAllInNewTabs,
      handleRemoveFromArea,
      handleDeleteDirectory,
      handleDeleteHistoryLevel,
      handleExpandAllTree,
      handleCollapseAllTree,
      handleRefreshTab,
      handleDeleteTab,
      handleCopyTabLink,
      handleOpenTabInNewTab,
      handleOpenTabInCurrentTab,
      handleBookmarkFromUrl,
      handleRemoveBookmarkTab,
      setBrowserMenuOpen,
      handleOpenTabFromTree,
      handleIframeLoad,
      handleIframeError,
      handleGoBack,
      handleGoForward,
      handleReload,
      canGoBack,
      canGoForward,
      setNavigatorMode,
      handleSelectTreePath,
      showToast,
      handleToggleNavigateMode,
      handleAlwaysNewTab,
    ],
  );

  const stateValue = useBrowserPanelState(
    {
      t,
      isBrowserVisible,
      activeTab,
      hasActiveTab,
      isBookmarked,
      browserTabs,
      browserTabFolders,
      tabTreeExpanded,
      allTreeExpanded,
      navigatorQuery,
      searchScope,
      searchResults,
      browserMenuOpen,
      browserMenuRef,
      browserMenuItems,
      loadingTabId,
      evictedTabIds,
      iframeRef,
      primaryRef,
      iframeBlockedDetected,
      iframeLoadError,
      validatedUrlsRef,
      navigatorMode,
      navigatorSearchRef,
      navigatorSearchInputRef,
      selectedTreePath,
      selectedTreePathRef,
      activatedTabIdsRef,
      urlState,
      handlePointerDown,
    },
    [
      t,
      isBrowserVisible,
      activeTab,
      hasActiveTab,
      isBookmarked,
      browserTabs,
      browserTabFolders,
      tabTreeExpanded,
      allTreeExpanded,
      navigatorQuery,
      searchScope,
      searchResults,
      browserMenuOpen,
      browserMenuRef,
      browserMenuItems,
      loadingTabId,
      evictedTabIds,
      iframeRef,
      primaryRef,
      iframeBlockedDetected,
      iframeLoadError,
      validatedUrlsRef,
      navigatorMode,
      navigatorSearchRef,
      navigatorSearchInputRef,
      selectedTreePath,
      selectedTreePathRef,
      activatedTabIdsRef,
      urlState,
      handlePointerDown,
    ],
  );

  const bookmarkTreeData = useMemo(
    () => buildBookmarkDirectoryTree(stateValue.visibleWorkspaces, browserTabFolders),
    [stateValue.visibleWorkspaces, browserTabFolders],
  );

  return (
    <BrowserPanelStateCtx.Provider value={stateValue}>
      <BrowserPanelActionsCtx.Provider value={actionsValue}>
        <BrowserShell
          contextMenu={contextMenu}
          handleTogglePin={handleTogglePin}
          handleCopyUrlFromMenu={handleCopyUrlFromMenu}
          handleOpenInNewTab={handleOpenInNewTab}
          handleOpenInCurrentTab={handleOpenInCurrentTab}
          wrappedHandleCloseTab={wrappedHandleCloseTab}
          handleDoubleClick={handleDoubleClick}
          createTabDialog={createTabDialog}
          editTabDialog={editTabDialog}
          isCreatingTab={isCreatingTab}
          handleCreateTabConfirm={handleCreateTabConfirm}
          handleCreateTabCancel={handleCreateTabCancel}
          handleEditTabConfirm={handleEditTabConfirm}
          handleEditTabCancel={handleEditTabCancel}
          bookmarkDialogOpen={bookmarkDialogOpen}
          bookmarkTreeData={bookmarkTreeData}
          handleBookmarkAddToFolder={handleBookmarkAddToFolder}
          handleBookmarkCreateDir={handleBookmarkCreateDir}
          setBookmarkDialogOpen={setBookmarkDialogOpen}
          setBookmarkName={setBookmarkName}
          bookmarkName={bookmarkName}
          renameFolderState={renameFolderState}
          setRenameFolderState={setRenameFolderState}
          createDirDialog={createDirDialog}
          setCreateDirDialog={setCreateDirDialog}
          toastMessages={toastMessages}
          removeToast={removeToast}
        />
      </BrowserPanelActionsCtx.Provider>
    </BrowserPanelStateCtx.Provider>
  );
}
