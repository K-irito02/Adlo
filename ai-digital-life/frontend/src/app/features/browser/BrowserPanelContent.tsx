import React, { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { BrowserToolbar } from './BrowserToolbar';
import { BrowserNavigator } from './BrowserNavigator';
import { useNavigatorResize } from '@hooks/useNavigatorResize';
import { computeNavigatorCount, findTabByUrl } from './useBrowserTabs';
import { BrowserIframeStack } from './BrowserIframeStack';
import { isTauriShell } from '@tauri-bridge';
import type { BrowserNavigatorMode } from './useBrowserTabs';
import type { BrowserSearchScope } from './useBrowserSearch';
import type { BrowserMenuItem } from './useBrowserMenus';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import type { TabFolderState } from '@stores/slices/browserFoldersSlice';
import type { CopyDict } from '@i18n/types';

interface BrowserPanelContentProps {
  t: CopyDict;
  isBrowserVisible: boolean;
  activeTab: BrowserTabState | undefined;
  hasActiveTab: boolean;
  isBookmarked: boolean;
  browserTabs: BrowserTabState[];
  handleCloseTab: (tabId: string) => void;
  handleCloseAllTabs: (workspaceId?: string) => void;
  handleClearTabDirectories: () => void;
  handleDoubleClick: (tabId: string, title: string) => void;
  handleOpenBookmarkDialog: () => void;
  handleEditTab: (tabId: string, name: string, url: string) => void;
  handleSetCreateTabDialog: React.Dispatch<
    React.SetStateAction<{ open: boolean; workspaceId?: string; folderId?: string }>
  >;
  setCreateDirDialog: React.Dispatch<
    React.SetStateAction<{ open: boolean; parentPath: string | null }>
  >;
  setRenameFolderState: React.Dispatch<
    React.SetStateAction<{
      open: boolean;
      folderId: string;
      currentName: string;
    }>
  >;
  navigatorQuery: string;
  searchScope: BrowserSearchScope;
  searchResults: { title: string; url: string; source: string }[];
  navigatorSearchRef: React.RefObject<HTMLDivElement | null>;
  navigatorSearchInputRef: React.RefObject<HTMLInputElement | null>;
  setNavigatorQuery: React.Dispatch<React.SetStateAction<string>>;
  setSearchScope: React.Dispatch<React.SetStateAction<BrowserSearchScope>>;
  browserTabFolders: TabFolderState[];
  tabTreeExpanded: Record<string, boolean>;
  allTreeExpanded: boolean;
  handleToggleTreePath: (path: string) => void;
  handleDeleteAllChildTabs: (_categoryType: string, nodePath: string) => void;
  handleDeleteOwnChildTabs: (_categoryType: string, nodePath: string) => void;
  handleOpenAllInNewTabs: (_categoryType: string, nodePath: string) => void;
  handleRemoveFromArea: (workspaceId: string) => void;
  handleDeleteDirectory: (folderId: string) => void;
  handleDeleteHistoryLevel: (level: 'label' | 'year' | 'month' | 'day', nodePath: string) => void;
  handleExpandAllTree: () => void;
  handleCollapseAllTree: () => void;
  handleRefreshTab: (tabId: string, url: string) => Promise<void>;
  handleDeleteTab: (tabId: string, url: string) => void;
  handleCopyTabLink: (url: string) => Promise<void>;
  handleOpenTabInNewTab: (url: string, title: string) => void;
  handleOpenTabInCurrentTab: (tabId: string) => void;
  onBookmarkTab?: (url: string, title: string) => void;
  onRemoveBookmarkTab?: (tabId: string, url: string) => void;
  browserMenuOpen: boolean;
  browserMenuRef: React.RefObject<HTMLDivElement | null>;
  browserMenuItems: BrowserMenuItem[];
  setBrowserMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  loadingTabId: string | null;
  evictedTabIds: ReadonlySet<string>;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  primaryRef: React.RefObject<HTMLDivElement | null>;
  handleIframeLoad: () => void;
  handleIframeError: () => void;
  iframeBlockedDetected: boolean;
  iframeLoadError: boolean;
  isEmbedPending: boolean;
  validatedUrlsRef: React.MutableRefObject<Set<string>>;
  handleGoBack: () => void;
  handleGoForward: () => void;
  handleReload: () => void;
  urlState: {
    address: string;
    addressExpanded: boolean;
    addressSearchRef: React.RefObject<HTMLLabelElement | null>;
    addressInputRef: React.RefObject<HTMLInputElement | null>;
    handleAddressChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleAddressKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    handleAddressBlur: () => void;
    handleSearchClick: () => void;
  };
  navigatorMode: BrowserNavigatorMode;
  setNavigatorMode: React.Dispatch<React.SetStateAction<BrowserNavigatorMode>>;
  selectedTreePath: string | null;
  selectedTreePathRef: React.MutableRefObject<string | null>;
  handleSelectTreePath: (path: string | null) => void;
  activatedTabIdsRef: React.MutableRefObject<Set<string>>;
  showToast: (message: string, type?: 'success' | 'warning' | 'error') => void;
}

export function BrowserPanelContent(props: BrowserPanelContentProps) {
  const {
    t,
    isBrowserVisible,
    activeTab,
    hasActiveTab,
    isBookmarked,
    browserTabs,
    handleCloseTab: _handleCloseTab,
    handleCloseAllTabs,
    handleClearTabDirectories,
    handleDoubleClick: _handleDoubleClick,
    handleOpenBookmarkDialog,
    handleEditTab,
    handleSetCreateTabDialog,
    setCreateDirDialog,
    setRenameFolderState,
    navigatorQuery,
    searchScope,
    searchResults,
    navigatorSearchRef,
    navigatorSearchInputRef,
    setNavigatorQuery,
    setSearchScope,
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
    onBookmarkTab,
    onRemoveBookmarkTab,
    browserMenuOpen,
    browserMenuRef,
    browserMenuItems,
    setBrowserMenuOpen,
    loadingTabId,
    evictedTabIds,
    iframeRef,
    primaryRef,
    handleIframeLoad,
    handleIframeError,
    iframeBlockedDetected,
    iframeLoadError,
    isEmbedPending,
    validatedUrlsRef,
    handleGoBack,
    handleGoForward,
    handleReload,
    urlState,
    navigatorMode,
    setNavigatorMode,
    selectedTreePath,
    selectedTreePathRef,
    handleSelectTreePath,
    activatedTabIdsRef,
    showToast,
  } = props;

  const {
    browserNavigatorWidth,
    navigatorCollapsedByTool,
    setBrowserNavigatorWidth,
    toggleBrowserNavigator,
    browserNavigateInPlace,
    setBrowserNavigateInPlace,
    recentWorkspaces,
    browserBookmarks,
    browserBookmarkTabIdUrlMap,
    browserHistory,
    browserWorkspaceBookmarks,
    browserOpenTab,
  } = useAppStore(
    useShallow((state) => ({
      browserNavigatorWidth: state.browserNavigatorWidth,
      navigatorCollapsedByTool: state.navigatorCollapsedByTool,
      setBrowserNavigatorWidth: state.setBrowserNavigatorWidth,
      toggleBrowserNavigator: state.toggleBrowserNavigator,
      browserNavigateInPlace: state.browserNavigateInPlace,
      setBrowserNavigateInPlace: state.setBrowserNavigateInPlace,
      recentWorkspaces: state.recentWorkspaces,
      browserBookmarks: state.browserBookmarks,
      browserBookmarkTabIdUrlMap: state.browserBookmarkTabIdUrlMap,
      browserHistory: state.browserHistory,
      browserWorkspaceBookmarks: state.browserWorkspaceBookmarks,
      browserOpenTab: state.browserOpenTab,
    }))
  );

  const navigatorCollapsed = navigatorCollapsedByTool.browser ?? false;

  const handleToggleNavigateMode = useCallback(
    (checked: boolean) => {
      setBrowserNavigateInPlace(checked);
    },
    [setBrowserNavigateInPlace]
  );

  const handleOpenTabFromTree = useCallback(
    (url: string, tabId?: string) => {
      if (tabId) {
        const tab = browserTabs.find((t) => t.id === tabId);
        if (tab) {
          useAppStore.getState().browserSelectTab(tabId);
          return;
        }
      }
      const existingTabId = findTabByUrl(browserTabs, url);
      if (existingTabId) {
        useAppStore.getState().browserSelectTab(existingTabId);
        return;
      }
      if (browserNavigateInPlace) {
        const state = useAppStore.getState();
        const activeTabId = state.browserActiveTabId;
        if (activeTabId && state.browserTabs.find((t) => t.id === activeTabId)) {
          state.browserNavigateActiveTab(url);
          if (isTauriShell()) {
            window.digitalLife?.browser?.navigateTab(activeTabId, url).catch(() => {});
          }
          return;
        }
      }
      browserOpenTab(url, undefined, undefined);
    },
    [browserTabs, browserOpenTab, browserNavigateInPlace]
  );

  const visibleWorkspaces = useMemo(
    () =>
      recentWorkspaces.filter(
        (w) => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available
      ),
    [recentWorkspaces]
  );

  const navigatorCount = useMemo(
    () =>
      computeNavigatorCount(
        navigatorMode,
        navigatorQuery,
        browserTabs,
        browserBookmarks,
        browserHistory,
        searchResults,
        [],
        []
      ),
    [navigatorMode, navigatorQuery, browserTabs, browserBookmarks, browserHistory, searchResults]
  );

  const openTabCount = navigatorCount;

  const rawNavigatorTitle =
    navigatorMode === 'open'
      ? t.browserOpenTabs
      : navigatorMode === 'tabs'
        ? t.browserTabDir
        : navigatorMode === 'list'
          ? t.browserViewModeList
          : t.browserSearchTabs;

  const navigatorTitle = rawNavigatorTitle;

  const { handlePointerDown: handleNavigatorResizeStart } = useNavigatorResize({
    onWidthCommit: setBrowserNavigatorWidth,
    minWidth: 180,
    maxWidth: 300,
  });

  const toggleNavigator = useCallback(
    (tool: string) => {
      if (tool === 'browser') {
        toggleBrowserNavigator();
      }
    },
    [toggleBrowserNavigator]
  );

  return (
    <>
      <BrowserToolbar
        t={t}
        navigatorCollapsed={navigatorCollapsed}
        address={urlState.address}
        addressExpanded={urlState.addressExpanded}
        addressSearchRef={urlState.addressSearchRef}
        addressInputRef={urlState.addressInputRef}
        activeTab={activeTab}
        isBookmarked={urlState.address ? isBookmarked : false}
        browserMenuOpen={browserMenuOpen}
        browserMenuRef={browserMenuRef}
        browserMenuItems={browserMenuItems}
        onToggleNavigator={() => toggleNavigator('browser')}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        onReload={handleReload}
        browserNavigateInPlace={browserNavigateInPlace}
        onToggleNavigateMode={handleToggleNavigateMode}
        onAddressChange={urlState.handleAddressChange}
        onAddressKeyDown={urlState.handleAddressKeyDown}
        onAddressBlur={urlState.handleAddressBlur}
        onSearchClick={urlState.handleSearchClick}
        onNewTab={() => browserOpenTab(undefined, t.browserNewTabPage)}
        onOpenBookmarkDialog={urlState.address ? handleOpenBookmarkDialog : () => {}}
        onToggleBrowserMenu={() => setBrowserMenuOpen((value) => !value)}
        onCloseBrowserMenu={() => setBrowserMenuOpen(false)}
      />

      <div
        className={`adl-tool-surface adl-tool-surface--files${navigatorCollapsed ? ' is-navigator-collapsed' : ''}`}
        style={
          {
            '--adl-files-nav-width': `${browserNavigatorWidth}px`,
          } as React.CSSProperties
        }
      >
        <BrowserNavigator
          t={t}
          navigatorTitle={navigatorTitle}
          openTabCount={openTabCount}
          allTreeExpanded={allTreeExpanded}
          navigatorMode={navigatorMode}
          browserNavigatorWidth={browserNavigatorWidth}
          activeTabId={activeTab?.id ?? ''}
          evictedTabIds={evictedTabIds}
          onExpandAllTree={handleExpandAllTree}
          onCollapseAllTree={handleCollapseAllTree}
          onSetNavigatorMode={setNavigatorMode}
          visibleWorkspaces={visibleWorkspaces}
          browserTabs={browserTabs}
          browserTabFolders={browserTabFolders}
          browserHistory={browserHistory}
          browserWorkspaceBookmarks={browserWorkspaceBookmarks}
          browserBookmarks={browserBookmarks}
          browserBookmarkTabIdUrlMap={browserBookmarkTabIdUrlMap}
          tabTreeExpanded={tabTreeExpanded}
          selectedTreePath={selectedTreePath}
          selectedTreePathRef={selectedTreePathRef}
          onSelectTreePath={handleSelectTreePath}
          onToggleTreePath={handleToggleTreePath}
          onDeleteAllChildTabs={handleDeleteAllChildTabs}
          onDeleteOwnChildTabs={handleDeleteOwnChildTabs}
          onOpenAllInNewTabs={handleOpenAllInNewTabs}
          onRemoveFromArea={handleRemoveFromArea}
          onDeleteDirectory={handleDeleteDirectory}
          onDeleteHistoryLevel={handleDeleteHistoryLevel}
          onCloseAllTabs={handleCloseAllTabs}
          onClearTabDirectories={handleClearTabDirectories}
          onOpenTab={browserOpenTab}
          onOpenTabFromTree={handleOpenTabFromTree}
          onRefreshTab={handleRefreshTab}
          onEditTab={handleEditTab}
          onDeleteTab={handleDeleteTab}
          onCopyTabLink={handleCopyTabLink}
          onOpenTabInNewTab={handleOpenTabInNewTab}
          onOpenTabInCurrentTab={handleOpenTabInCurrentTab}
          onBookmarkTab={onBookmarkTab}
          onRemoveBookmarkTab={onRemoveBookmarkTab}
          onCloseTabHandler={_handleCloseTab}
          onCreateTabDialog={handleSetCreateTabDialog}
          onCreateDirDialog={setCreateDirDialog}
          onRenameFolder={setRenameFolderState}
          navigatorQuery={navigatorQuery}
          searchScope={searchScope}
          searchResults={searchResults}
          navigatorSearchRef={navigatorSearchRef}
          navigatorSearchInputRef={navigatorSearchInputRef}
          onSetNavigatorQuery={setNavigatorQuery}
          onSetSearchScope={setSearchScope}
          onNavigatorResizeStart={handleNavigatorResizeStart}
          showToast={showToast}
        />

        <div className="adl-tool-primary adl-tool-primary--browser" ref={primaryRef}>
          <BrowserIframeStack
            t={t}
            activeTab={activeTab}
            hasActiveTab={hasActiveTab}
            browserTabs={browserTabs}
            isBrowserVisible={isBrowserVisible}
            loadingTabId={loadingTabId}
            iframeRef={iframeRef}
            handleIframeLoad={handleIframeLoad}
            handleIframeError={handleIframeError}
            iframeBlockedDetected={iframeBlockedDetected}
            iframeLoadError={iframeLoadError}
            isEmbedPending={isEmbedPending}
            validatedUrlsRef={validatedUrlsRef}
            activatedTabIdsRef={activatedTabIdsRef}
          />
        </div>
      </div>
    </>
  );
}
