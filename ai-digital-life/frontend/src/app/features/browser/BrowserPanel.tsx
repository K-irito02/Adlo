import { useCallback, useMemo, useRef } from 'react';
import { useBrowserToast } from './useBrowserToast';
import { useBrowserDialogs } from './useBrowserDialogs';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { useBrowserTabs } from './useBrowserTabs';
import { useBrowserWebView } from './useBrowserWebView';
import { useBrowserUrlChange } from './useBrowserUrlChange';
import { useBrowserSearch } from './useBrowserSearch';
import { useBrowserTreeActions } from './useBrowserTreeActions';
import { useBrowserNavigation } from './useBrowserNavigation';
import { useBrowserUrlState } from './useBrowserUrlState';
import { useBrowserPageMeta } from './useBrowserPageMeta';
import { useBrowserMetaSubscription } from './useBrowserMetaSubscription';
import { useBrowserMenus } from './useBrowserMenus';
import { BrowserContextMenu } from './BrowserContextMenu';
import { useBrowserThemeSync } from './useBrowserThemeSync';
import { BrowserPanelStateCtx } from './BrowserPanelStateContext';
import { BrowserPanelActionsCtx } from './BrowserPanelActionsContext';
import type { BrowserPanelActions } from './BrowserPanelActionsContext';
import { BrowserToolbar } from './BrowserToolbar';
import { BrowserNavigator } from './BrowserNavigator';
import { BrowserIframeStack } from './BrowserIframeStack';
import type { BrowserPanelProps } from '@regions/right-panel/types';
import { useTCopy } from '@i18n/useTCopy';
import {
  handleRenameFromContextMenu,
  handleDeleteFromContextMenu,
  buildBookmarkDirectoryTree,
} from './browserPanelHelpers';
import { BrowserPanelDialogs } from './BrowserPanelDialogs';
import { setCachedFavicon } from '@utils/fetchPageMeta';
import { getGoogleFaviconUrl } from '@utils/favicon';
import { useBrowserIframeState } from './useBrowserIframeState';
import { useBrowserNavigatorState } from './useBrowserNavigatorState';
import { useBrowserPanelMenuItems } from './useBrowserPanelMenuItems';
import { useBrowserPanelAddressSubmit } from './useBrowserPanelAddressSubmit';
import { useBrowserPanelCloseHandlers } from './useBrowserPanelCloseHandlers';
import { useBrowserPanelEffects } from './useBrowserPanelEffects';
import { useBrowserZoomState } from './useBrowserZoomState';

export function BrowserPanel(props: BrowserPanelProps) {
  const { t } = useTCopy();
  useBrowserThemeSync();

  const isBrowserVisible = props.isVisible ?? false;

  const {
    browserOpenTab,
    browserNavigateActiveTab,
    browserUpdateTab,
    recentWorkspaces,
    browserBookmarks,
    browserHistory,
    browserNavigatorWidth,
    navigatorCollapsedByTool,
    toggleNavigator,
    setBrowserNavigateInPlace,
    browserNavigateInPlace,
    browserSelectTab,
  } = useAppStore(
    useShallow((state) => ({
      browserOpenTab: state.browserOpenTab,
      browserNavigateActiveTab: state.browserNavigateActiveTab,
      browserUpdateTab: state.browserUpdateTab,
      recentWorkspaces: state.recentWorkspaces,
      browserBookmarks: state.browserBookmarks,
      browserHistory: state.browserHistory,
      browserNavigatorWidth: state.browserNavigatorWidth,
      navigatorCollapsedByTool: state.navigatorCollapsedByTool,
      toggleNavigator: state.toggleNavigator,
      setBrowserNavigateInPlace: state.setBrowserNavigateInPlace,
      browserNavigateInPlace: state.browserNavigateInPlace,
      browserSelectTab: state.browserSelectTab,
    }))
  );

  const { toastMessages, showToast, removeToast } = useBrowserToast();

  const activatedTabIdsRef = useRef(new Set<string>());
  const pendingNavigationsRef = useRef<Set<string>>(new Set());

  const handleNavigationStart = useCallback((url: string) => {
    // Track pending navigation so handlePageMeta creates tab only when real title arrives
    pendingNavigationsRef.current.add(url);
    // Preload Google S2 favicon so image is already loading when tab renders
    const faviconUrl = getGoogleFaviconUrl(url);
    if (faviconUrl) {
      setCachedFavicon(url, faviconUrl);
      new Image().src = faviconUrl;
    }
  }, []);

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
  });

  const { wrappedHandleCloseTab, handleCloseAllTabs, handleClearTabDirectories } =
    useBrowserPanelCloseHandlers({
      handleCloseTab,
      originalCloseAllTabs: _handleCloseAllTabs,
      originalClearTabDirectories: _handleClearTabDirectories,
      removeFromPool,
    });

  const { handlePageMeta: _handlePageMeta } = useBrowserPageMeta(
    pendingNavigationsRef,
    undefined,
    showToast,
    markUrlSeen
  );

  useBrowserMetaSubscription((meta) => {
    _handlePageMeta(meta, 'com');
  });

  const { handleIframeLoad, handleIframeError } = useBrowserUrlChange({
    activeTab,
    activeTabRef,
    iframeRef,
    expectedNavigationUrlRef,
    setAddress,
    browserNavigateActiveTab,
    browserUpdateTab,
    onPageMeta: _handlePageMeta,
    onNavigationStart: handleNavigationStart,
    markUrlSeen,
    setIframeLoadError,
  });

  const { browserMenuItems } = useBrowserPanelMenuItems({
    activeTab,
    browserNavigateActiveTab,
    zoomLevel,
    setZoomLevel,
    t,
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

  const visibleWorkspaces = useMemo(
    () =>
      recentWorkspaces.filter(
        (w) => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available
      ),
    [recentWorkspaces]
  );

  const bookmarkTreeData = useMemo(
    () => buildBookmarkDirectoryTree(visibleWorkspaces, browserTabFolders),
    [visibleWorkspaces, browserTabFolders]
  );

  const { handleGoBack, handleGoForward, handleReload } = useBrowserNavigation({
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

  const isTauri = useAppStore((s) => s.isTauri);
  const isEmbedPending =
    !isTauri &&
    !!activeTab?.url &&
    activeTab?.url !== 'about:blank' &&
    !validatedUrlsRef.current.has(activeTab.url ?? '') &&
    !iframeBlockedDetected &&
    !iframeLoadError;

  const navigatorCollapsed = navigatorCollapsedByTool.browser ?? false;

  const handleOpenTabFromTree = useCallback(
    (url: string, tabId?: string) => {
      if (tabId) {
        // Clicking an existing tab → switch to it (unaffected by toggle)
        browserSelectTab(tabId);
      } else if (browserNavigateInPlace) {
        // "Current tab" mode → navigate within the active tab
        browserNavigateActiveTab(url);
      } else {
        // "New tab" mode → open a new tab
        browserOpenTab(url, url);
      }
    },
    [browserOpenTab, browserNavigateActiveTab, browserSelectTab, browserNavigateInPlace]
  );

  const handleToggleNavigateMode = useCallback(
    (checked: boolean) => {
      setBrowserNavigateInPlace(checked);
    },
    [setBrowserNavigateInPlace]
  );

  const openTabCount = browserTabs.length;
  const navigatorTitle = t.toolBrowser;

  const handlePointerDown = useCallback((_e: React.PointerEvent) => {}, []);

  const actionsValue = useMemo<BrowserPanelActions>(
    () => ({
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
      setNavigatorMode,
      handleSelectTreePath,
      showToast,
      browserOpenTab,
      handleToggleNavigateMode,
      toggleNavigator: toggleNavigator as (tool: string) => void,
    }),
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
      setNavigatorMode,
      handleSelectTreePath,
      showToast,
      browserOpenTab,
      handleToggleNavigateMode,
      toggleNavigator,
    ]
  );

  const stateMemo = useMemo(
    () => ({
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
      isEmbedPending,
      validatedUrlsRef,
      navigatorMode,
      navigatorSearchRef,
      navigatorSearchInputRef,
      selectedTreePath,
      selectedTreePathRef,
      activatedTabIdsRef,
      urlState,
      navigatorCollapsed,
      browserNavigatorWidth,
      visibleWorkspaces,
      handlePointerDown,
      openTabCount,
      navigatorTitle,
    }),
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
      isEmbedPending,
      validatedUrlsRef,
      navigatorMode,
      navigatorSearchRef,
      navigatorSearchInputRef,
      selectedTreePath,
      selectedTreePathRef,
      activatedTabIdsRef,
      urlState,
      navigatorCollapsed,
      browserNavigatorWidth,
      visibleWorkspaces,
      handlePointerDown,
      openTabCount,
      navigatorTitle,
    ]
  );

  return (
    <BrowserPanelStateCtx.Provider value={stateMemo}>
      <BrowserPanelActionsCtx.Provider value={actionsValue}>
        <div className="adl-tool-panel adl-tool-panel--browser">
          <BrowserToolbar />
          <div
            className={`adl-tool-surface adl-tool-surface--files${navigatorCollapsed ? ' is-navigator-collapsed' : ''}`}
            style={{ '--adl-files-nav-width': `${browserNavigatorWidth}px` } as React.CSSProperties}
          >
            <BrowserNavigator />
            <div className="adl-tool-primary adl-tool-primary--browser" ref={primaryRef}>
              <BrowserIframeStack />
            </div>
          </div>
          <BrowserContextMenu
            contextMenu={contextMenu}
            onTogglePin={handleTogglePin}
            onRename={handleRenameFromContextMenu(browserTabs, contextMenu, handleDoubleClick)}
            onDelete={handleDeleteFromContextMenu(contextMenu, wrappedHandleCloseTab)}
            onCopyUrl={handleCopyUrlFromMenu}
            onOpenInNewTab={handleOpenInNewTab}
            onOpenInCurrentTab={handleOpenInCurrentTab}
            onEdit={handleRenameFromContextMenu(browserTabs, contextMenu, handleDoubleClick)}
            onCut={() => {}}
          />

          <BrowserPanelDialogs
            t={t}
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
        </div>
      </BrowserPanelActionsCtx.Provider>
    </BrowserPanelStateCtx.Provider>
  );
}
