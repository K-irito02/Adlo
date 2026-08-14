import { useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
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

  const {
    pendingNavigationsRef,
    handleNavigationStart,
    handleOpenTabFromTree,
    handleToggleNavigateMode,
    handlePointerDown,
  } = useBrowserPanelHandlers({
    browserOpenTab,
    browserNavigateActiveTab,
    browserSelectTab,
    browserNavigateInPlace,
    setBrowserNavigateInPlace,
  });

  const activatedTabIdsRef = useRef(new Set<string>());
  /** Shared between useBrowserUrlChange and useWebViewLifecycle: tracks
   *  URLs that were navigated by the WebView itself (via onUrlChanged).
   *  A Set is used instead of a boolean to handle server redirects: when
   *  on_navigation fires for URL-A then URL-B (redirect), both are added
   *  to the set so useWebViewLifecycle skips navigateTabInPool for both —
   *  avoiding a double page reload (the bug with Bilibili's tracking-param
   *  redirects). Kept capped at 10 to avoid unbounded growth. */
  const webViewSelfNavigatedRef = useRef(new Set<string>());

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
  } = useBrowserTreeActions();

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
    loadingTabId,
    poolVersion: _poolVersion,
  } = useBrowserWebView({
    activeTab,
    webViewDisabled: false,
    isVisible: isBrowserVisible,
    overlayActive: hasOverlayActive,
    webViewSelfNavigatedRef,
  });

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
    webViewSelfNavigatedRef,
    markUrlSeen,
    setAddress,
    setIframeLoadError,
    browserNavigateActiveTab,
    browserUpdateTab,
    onNavigationStart: handleNavigationStart,
  });

  const { browserMenuItems } = useBrowserPanelMenuItems({
    activeTab,
    browserNavigateActiveTab,
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
    browserLookupIndex,
    handleNavigationStart,
    navigateBrowser,
    browserNavigateActiveTab,
    setIframeLoadError,
    setIframeBlockedDetected,
    handlePageMeta: _handlePageMeta,
    addressSubmittedForTabRef,
    submitVersionRef,
    validatedUrlsRef,
  });

  const { handleGoBack, handleGoForward, handleReload, canGoBack, canGoForward } =
    useBrowserNavigation({
      iframeRef,
      iframeHistory,
      navigateBrowser,
      activeTabId: activeTab?.id,
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
    submitAddress,
    activeTabUrl,
  });

  useBrowserPanelEffects({
    activeTab,
    addressSubmittedForTabRef,
    setAddress,
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
