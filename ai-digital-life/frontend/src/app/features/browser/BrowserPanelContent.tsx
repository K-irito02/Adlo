import React, { useCallback, useMemo } from 'react';
import { SafeIframe } from './SafeIframe';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { ExternalLinkError } from './ExternalLinkError';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../stores/slicedStore';
import { BrowserToolbar } from './BrowserToolbar';
import { BrowserNavigator } from './BrowserNavigator';
import { isTauriShell } from '../../../tauri-bridge';
import { BrowserLandingPage } from './browser-landing';
import { useNavigatorResize } from '../../hooks/useNavigatorResize';
import { computeNavigatorCount } from './useBrowserTabs';
import type { BrowserNavigatorMode } from './useBrowserTabs';
import type { BrowserSearchScope } from './useBrowserSearch';
import type { BrowserMenuItem } from './useBrowserMenus';
import type { BrowserTabState } from '../../stores/slices/browserSlice';
import type { TabFolderState } from '../../stores/slices/browserFoldersSlice';
import type { CopyDict } from '../../i18n/types';

interface BrowserPanelContentProps {
  t: CopyDict;
  isBrowserVisible: boolean;
  // --- useBrowserTabs ---
  activeTab: BrowserTabState | undefined;
  hasActiveTab: boolean;
  isBookmarked: boolean;
  browserTabs: BrowserTabState[];
  handleCloseTab: (tabId: string) => void;
  handleCloseAllTabs: (workspaceId?: string) => void;
  handleDoubleClick: (tabId: string, title: string) => void;
  // --- useBrowserDialogs ---
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
  // --- useBrowserSearch ---
  navigatorQuery: string;
  searchScope: BrowserSearchScope;
  searchResults: { title: string; url: string; source: string }[];
  navigatorSearchRef: React.RefObject<HTMLDivElement | null>;
  navigatorSearchInputRef: React.RefObject<HTMLInputElement | null>;
  setNavigatorQuery: React.Dispatch<React.SetStateAction<string>>;
  setSearchScope: React.Dispatch<React.SetStateAction<BrowserSearchScope>>;
  // --- useBrowserTreeActions ---
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
  // --- useBrowserMenus ---
  browserMenuOpen: boolean;
  browserMenuRef: React.RefObject<HTMLDivElement | null>;
  browserMenuItems: BrowserMenuItem[];
  setBrowserMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  // --- useBrowserWebView ---
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  primaryRef: React.RefObject<HTMLDivElement | null>;
  handleIframeLoad: () => void;
  handleIframeError: () => void;
  iframeBlockedDetected: boolean;
  iframeLoadError: boolean;
  isEmbedPending: boolean;
  validatedUrlsRef: React.MutableRefObject<Set<string>>;
  // --- useBrowserNavigation ---
  handleGoBack: () => void;
  handleGoForward: () => void;
  handleReload: () => void;
  // --- useBrowserUrlState ---
  urlState: {
    address: string;
    addressExpanded: boolean;
    addressSearchRef: React.RefObject<HTMLLabelElement | null>;
    addressInputRef: React.RefObject<HTMLInputElement | null>;
    handleAddressChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleAddressKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    handleAddressBlur: () => void;
    handleSearchClick: () => void;
    handleCopyUrl: (url: string) => void;
  };
  // --- local state ---
  navigatorMode: BrowserNavigatorMode;
  setNavigatorMode: React.Dispatch<React.SetStateAction<BrowserNavigatorMode>>;
  selectedTreePath: string | null;
  selectedTreePathRef: React.MutableRefObject<string | null>;
  handleSelectTreePath: (path: string | null) => void;
  // --- toast ---
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
    browserMenuOpen,
    browserMenuRef,
    browserMenuItems,
    setBrowserMenuOpen,
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
    showToast,
  } = props;

  // --- Store selectors for content rendering ---
  const {
    browserViewMode,
    browserShowTabButtons,
    setBrowserViewMode,
    setBrowserShowTabButtons,
    browserNavigatorWidth,
    navigatorCollapsedByTool,
    setBrowserNavigatorWidth,
    toggleBrowserNavigator,
    browserNavigateInPlace,
    setBrowserNavigateInPlace,
    recentWorkspaces,
    browserBookmarks,
    browserHistory,
    browserWorkspaceBookmarks,
    browserOpenTab,
  } = useAppStore(
    useShallow((state) => ({
      browserViewMode: state.browserViewMode,
      browserShowTabButtons: state.browserShowTabButtons,
      setBrowserViewMode: state.setBrowserViewMode,
      setBrowserShowTabButtons: state.setBrowserShowTabButtons,
      browserNavigatorWidth: state.browserNavigatorWidth,
      navigatorCollapsedByTool: state.navigatorCollapsedByTool,
      setBrowserNavigatorWidth: state.setBrowserNavigatorWidth,
      toggleBrowserNavigator: state.toggleBrowserNavigator,
      browserNavigateInPlace: state.browserNavigateInPlace,
      setBrowserNavigateInPlace: state.setBrowserNavigateInPlace,
      recentWorkspaces: state.recentWorkspaces,
      browserBookmarks: state.browserBookmarks,
      browserHistory: state.browserHistory,
      browserWorkspaceBookmarks: state.browserWorkspaceBookmarks,
      browserOpenTab: state.browserOpenTab,
    }))
  );

  const navigatorCollapsed = navigatorCollapsedByTool.browser ?? false;

  // --- Memos and callbacks for content rendering ---
  const handleToggleNavigateMode = useCallback(
    (checked: boolean) => {
      setBrowserNavigateInPlace(checked);
    },
    [setBrowserNavigateInPlace]
  );

  const handleToggleTabButtons = useCallback(() => {
    if (browserShowTabButtons) {
      setBrowserShowTabButtons(false);
      setBrowserViewMode('default');
    } else {
      setBrowserShowTabButtons(true);
      setBrowserViewMode('tree');
    }
  }, [browserShowTabButtons, setBrowserShowTabButtons, setBrowserViewMode]);

  const handleSetBrowserViewMode = useCallback(
    (mode: 'tree' | 'list' | 'all') => {
      setBrowserViewMode(mode);
      setBrowserShowTabButtons(true);
    },
    [setBrowserViewMode, setBrowserShowTabButtons]
  );

  const handleDirectListView = useCallback(() => {
    setBrowserViewMode('list');
    setNavigatorMode('tabs');
  }, [setBrowserViewMode, setNavigatorMode]);

  const handleOpenTabFromTree = useCallback(
    (url: string, tabId?: string) => {
      if (tabId) {
        const tab = browserTabs.find((t) => t.id === tabId);
        if (tab) {
          useAppStore.getState().browserSelectTab(tabId);
          return;
        }
      }
      browserOpenTab(url, undefined, undefined);
    },
    [browserTabs, browserOpenTab]
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
    navigatorMode === 'tabs'
      ? t.browserOpenTabs
      : navigatorMode === 'bookmarks'
        ? t.browserSavedTabs
        : navigatorMode === 'history'
          ? t.browserHistoryTabs
          : t.browserSearchTabs;

  const navigatorTitle = useMemo(() => {
    if (browserShowTabButtons) {
      const modeLabels: Record<string, string> = {
        tree: t.browserViewModeTree,
        list: t.browserViewModeList,
        all: t.browserViewModeAll,
      };
      return modeLabels[browserViewMode] || t.browserViewModeDefault;
    }
    return rawNavigatorTitle;
  }, [browserShowTabButtons, browserViewMode, rawNavigatorTitle, t]);

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
        onCopyUrl={urlState.handleCopyUrl}
        onNewTab={() => browserOpenTab()}
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
          browserShowTabButtons={browserShowTabButtons}
          browserViewMode={browserViewMode}
          navigatorMode={navigatorMode}
          browserNavigatorWidth={browserNavigatorWidth}
          onToggleTabButtons={handleToggleTabButtons}
          onSetBrowserViewMode={handleSetBrowserViewMode}
          onDirectListView={handleDirectListView}
          onExpandAllTree={handleExpandAllTree}
          onCollapseAllTree={handleCollapseAllTree}
          onSetNavigatorMode={setNavigatorMode}
          onSetBrowserViewModeRaw={setBrowserViewMode}
          visibleWorkspaces={visibleWorkspaces}
          browserTabs={browserTabs}
          browserTabFolders={browserTabFolders}
          browserHistory={browserHistory}
          browserWorkspaceBookmarks={browserWorkspaceBookmarks}
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
          onOpenTab={browserOpenTab}
          onOpenTabFromTree={handleOpenTabFromTree}
          onRefreshTab={handleRefreshTab}
          onEditTab={handleEditTab}
          onDeleteTab={handleDeleteTab}
          onCopyTabLink={handleCopyTabLink}
          onOpenTabInNewTab={handleOpenTabInNewTab}
          onOpenTabInCurrentTab={handleOpenTabInCurrentTab}
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
          {!urlState.address ||
          !hasActiveTab ||
          !activeTab?.url ||
          activeTab?.url === 'about:blank' ? (
            <div className="adl-tool-primary__scroll adl-tool-primary__scroll--browser">
              <BrowserLandingPage t={t} />
            </div>
          ) : (
            <ErrorBoundary
              fallback={
                <ExternalLinkError
                  errorKey="browserCannotOpenEmbedded"
                  activeTabUrl={activeTab?.url}
                  t={t}
                  variant="active"
                />
              }
            >
              {!isTauriShell() &&
                activeTab?.url &&
                activeTab.url !== 'about:blank' &&
                validatedUrlsRef.current.has(activeTab.url) && (
                  <SafeIframe
                    iframeRef={iframeRef}
                    src={activeTab.url}
                    className="adl-browser-iframe"
                    title={activeTab.title}
                    onLoad={handleIframeLoad}
                    onError={handleIframeError}
                    sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
                    style={{ display: isBrowserVisible ? undefined : 'none' }}
                  />
                )}

              {!isTauriShell() && iframeBlockedDetected && (
                <ExternalLinkError
                  errorKey="browserCannotOpenEmbedded"
                  activeTabUrl={activeTab?.url}
                  t={t}
                  variant="blocked"
                />
              )}

              {!isTauriShell() && iframeLoadError && !iframeBlockedDetected && (
                <ExternalLinkError
                  errorKey="browserConnectionFailed"
                  activeTabUrl={activeTab?.url}
                  t={t}
                  variant="blocked"
                />
              )}

              {isEmbedPending && (
                <div className="adl-browser-loading">
                  <div className="adl-browser-loading__spinner" />
                </div>
              )}
            </ErrorBoundary>
          )}
        </div>
      </div>
    </>
  );
}
