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
import { BrowserPanelContent } from './BrowserPanelContent';
import { useBrowserThemeSync } from './useBrowserThemeSync';
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
  } = useAppStore(
    useShallow((state) => ({
      browserOpenTab: state.browserOpenTab,
      browserNavigateActiveTab: state.browserNavigateActiveTab,
      browserUpdateTab: state.browserUpdateTab,
      recentWorkspaces: state.recentWorkspaces,
      browserBookmarks: state.browserBookmarks,
      browserHistory: state.browserHistory,
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

  const isTauri = useAppStore(s => s.isTauri);
  const isEmbedPending =
    !isTauri &&
    !!activeTab?.url &&
    activeTab?.url !== 'about:blank' &&
    !validatedUrlsRef.current.has(activeTab.url ?? '') &&
    !iframeBlockedDetected &&
    !iframeLoadError;

  return (
    <div className="adl-tool-panel adl-tool-panel--browser">
      <BrowserPanelContent
        t={t}
        isBrowserVisible={isBrowserVisible}
        activeTab={activeTab}
        hasActiveTab={hasActiveTab}
        isBookmarked={isBookmarked}
        browserTabs={browserTabs}
        handleCloseTab={wrappedHandleCloseTab}
        handleCloseAllTabs={handleCloseAllTabs}
        handleClearTabDirectories={handleClearTabDirectories}
        handleDoubleClick={handleDoubleClick}
        handleOpenBookmarkDialog={handleOpenBookmarkDialog}
        handleEditTab={handleEditTab}
        handleSetCreateTabDialog={handleSetCreateTabDialog}
        setCreateDirDialog={setCreateDirDialog}
        setRenameFolderState={setRenameFolderState}
        navigatorQuery={navigatorQuery}
        searchScope={searchScope}
        searchResults={searchResults}
        navigatorSearchRef={navigatorSearchRef}
        navigatorSearchInputRef={navigatorSearchInputRef}
        setNavigatorQuery={setNavigatorQuery}
        setSearchScope={setSearchScope}
        browserTabFolders={browserTabFolders}
        tabTreeExpanded={tabTreeExpanded}
        allTreeExpanded={allTreeExpanded}
        handleToggleTreePath={handleToggleTreePath}
        handleDeleteAllChildTabs={handleDeleteAllChildTabs}
        handleDeleteOwnChildTabs={handleDeleteOwnChildTabs}
        handleOpenAllInNewTabs={handleOpenAllInNewTabs}
        handleRemoveFromArea={handleRemoveFromArea}
        handleDeleteDirectory={handleDeleteDirectory}
        handleDeleteHistoryLevel={handleDeleteHistoryLevel}
        handleExpandAllTree={handleExpandAllTree}
        handleCollapseAllTree={handleCollapseAllTree}
        handleRefreshTab={handleRefreshTab}
        handleDeleteTab={handleDeleteTab}
        handleCopyTabLink={handleCopyTabLink}
        handleOpenTabInNewTab={handleOpenTabInNewTab}
        handleOpenTabInCurrentTab={handleOpenTabInCurrentTab}
        onBookmarkTab={handleBookmarkFromUrl}
        onRemoveBookmarkTab={handleRemoveBookmarkTab}
        browserMenuOpen={browserMenuOpen}
        browserMenuRef={browserMenuRef}
        browserMenuItems={browserMenuItems}
        setBrowserMenuOpen={setBrowserMenuOpen}
        activatedTabIdsRef={activatedTabIdsRef}
        loadingTabId={loadingTabId}
        evictedTabIds={evictedTabIds}
        iframeRef={iframeRef}
        primaryRef={primaryRef}
        handleIframeLoad={handleIframeLoad}
        handleIframeError={handleIframeError}
        iframeBlockedDetected={iframeBlockedDetected}
        iframeLoadError={iframeLoadError}
        isEmbedPending={isEmbedPending}
        validatedUrlsRef={validatedUrlsRef}
        handleGoBack={handleGoBack}
        handleGoForward={handleGoForward}
        handleReload={handleReload}
        urlState={urlState}
        navigatorMode={navigatorMode}
        setNavigatorMode={setNavigatorMode}
        selectedTreePath={selectedTreePath}
        selectedTreePathRef={selectedTreePathRef}
        handleSelectTreePath={handleSelectTreePath}
        showToast={showToast}
      />

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
  );
}
