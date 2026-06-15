import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IconFolderPlus,
  IconFolder,
  IconPlus,
  IconTrash,
  IconSearch,
  IconList,
  IconLayoutList,
  IconReturn,
  IconFoldVertical,
  IconUnfoldVertical,
} from '../../icons';
import { TooltipSimple } from '../../components/Tooltip';
import { RenameDialog } from '../../components/RenameDialog';
import { ToastContainer, type ToastType } from '../../components/Toast';
import { NavigatorResizeHandle } from '@components/NavigatorResizeHandle';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../stores/slicedStore';
import { useBrowserTabs, computeNavigatorCount } from './useBrowserTabs';
import type { BrowserNavigatorMode } from './useBrowserTabs';
import { useBrowserWebView } from './useBrowserWebView';
import { useBrowserSearch, findInBrowserLookupIndex } from './useBrowserSearch';
import { useBrowserTreeActions } from './useBrowserTreeActions';
import { useBrowserNavigation } from './useBrowserNavigation';
import { useBrowserUrlState } from './useBrowserUrlState';
import { useBrowserMenus } from './useBrowserMenus';
import { BrowserContextMenu } from './BrowserContextMenu';
import { BrowserToolbar } from './BrowserToolbar';
import { BrowserTabTree } from '../browser-tree';
import { CustomScrollArea } from '../file-tree/CustomScrollArea';
import { isTauriShell } from '../../../tauri-bridge';
import { BrowserLandingPage, CreateTabDialog } from './browser-landing';
import type { BrowserPanelProps } from '../../regions/right-panel/types';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { useNavigatorResize } from '../../hooks/useNavigatorResize';
import { useTCopy } from '../../i18n/useTCopy';
import {
  resolveFolderWorkspaceId,
  handleRenameFromContextMenu,
  handleDeleteFromContextMenu,
  buildBookmarkDirectoryTree,
} from './browserPanelHelpers';
import { BookmarkToFolderDialog } from './BookmarkToFolderDialog';
import { SearchResultItem } from './BrowserSearchOverlay';

export function BrowserPanel(props: BrowserPanelProps) {
  const { t } = useTCopy();

  const isBrowserVisible = props.isVisible ?? false;

  const {
    browserOpenTab,
    browserViewMode,
    browserShowTabButtons,
    setBrowserViewMode,
    setBrowserShowTabButtons,
    browserNavigatorWidth,
    navigatorCollapsedByTool,
    setBrowserNavigatorWidth,
    toggleBrowserNavigator,
    browserNavigateActiveTab,
    browserUpdateTab,
  } = useAppStore(
    useShallow((state) => ({
      browserOpenTab: state.browserOpenTab,
      browserViewMode: state.browserViewMode,
      browserShowTabButtons: state.browserShowTabButtons,
      setBrowserViewMode: state.setBrowserViewMode,
      setBrowserShowTabButtons: state.setBrowserShowTabButtons,
      browserNavigatorWidth: state.browserNavigatorWidth,
      navigatorCollapsedByTool: state.navigatorCollapsedByTool,
      setBrowserNavigatorWidth: state.setBrowserNavigatorWidth,
      toggleBrowserNavigator: state.toggleBrowserNavigator,
      browserNavigateActiveTab: state.browserNavigateActiveTab,
      browserUpdateTab: state.browserUpdateTab,
    }))
  );
  const recentWorkspaces = useAppStore(useShallow((state) => state.recentWorkspaces));
  const browserBookmarks = useAppStore(useShallow((state) => state.browserBookmarks));
  const browserHistory = useAppStore(useShallow((state) => state.browserHistory));
  const browserWorkspaceBookmarks = useAppStore(
    useShallow((state) => state.browserWorkspaceBookmarks)
  );

  const navigatorCollapsed = navigatorCollapsedByTool.browser ?? false;

  const [navigatorMode, setNavigatorMode] = useState<BrowserNavigatorMode>('tabs');
  const [address, setAddress] = useState('');
  const [addressExpanded, setAddressExpanded] = useState(false);
  const addressSearchRef = useRef<HTMLLabelElement | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);

  const [renameFolderState, setRenameFolderState] = useState<{
    open: boolean;
    folderId: string;
    currentName: string;
  }>({
    open: false,
    folderId: '',
    currentName: '',
  });

  const [createDirDialog, setCreateDirDialog] = useState<{
    open: boolean;
    parentPath: string | null;
  }>({ open: false, parentPath: null });

  const [selectedTreePath, setSelectedTreePath] = useState<string | null>(null);
  const selectedTreePathRef = useRef<string | null>(null);

  const [toastMessages, setToastMessages] = useState<
    Array<{ id: string; message: string; type?: ToastType; source?: string }>
  >([]);

  const showToast = useCallback((message: string, type?: ToastType, source?: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setToastMessages((prev) => [...prev, { id, message, type, source }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToastMessages((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const [createTabDialog, setCreateTabDialog] = useState<{
    open: boolean;
    workspaceId?: string;
  }>({ open: false });

  const [bookmarkDialogOpen, setBookmarkDialogOpen] = useState(false);

  const handleCreateTabConfirm = useCallback(
    (name: string, url: string) => {
      setCreateTabDialog((prev) => {
        browserOpenTab(url, name, prev.workspaceId);
        return { open: false };
      });
    },
    [browserOpenTab]
  );

  const handleCreateTabCancel = useCallback(() => {
    setCreateTabDialog({ open: false });
  }, []);

  const handleSelectTreePath = useCallback((path: string | null) => {
    selectedTreePathRef.current = path;
    setSelectedTreePath(path);
  }, []);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const clickedEntry = target.closest('.adl-browser-entry');
      const clickedFileTreeRow = target.closest('.adl-filetree__row');

      if (clickedEntry) {
        if (clickedFileTreeRow) {
          const row = clickedFileTreeRow as HTMLElement;
          const nodePath = row.dataset.path;
          if (nodePath) {
            handleSelectTreePath(nodePath);
            return;
          }
        }
        return;
      }

      handleSelectTreePath(null);
    };
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, [handleSelectTreePath]);

  const {
    activeTab,
    hasActiveTab,
    isBookmarked,
    browserTabs,
    handleDoubleClick,
    handleCloseTab,
    handleCloseAllTabs,
  } = useBrowserTabs();

  const handleOpenBookmarkDialog = useCallback(() => {
    if (isBookmarked) {
      useAppStore.getState().browserToggleBookmark();
      return;
    }
    setBookmarkDialogOpen(true);
  }, [isBookmarked]);

  const {
    iframeLoadError,
    setIframeLoadError,
    iframeHistory,
    setIframeHistory,
    iframeRef,
    primaryRef,
    navigateBrowser,
    handleIframeLoad,
    handleIframeError,
  } = useBrowserWebView({
    activeTab,
    webViewDisabled: false,
    isVisible: isBrowserVisible,
    setAddress,
    browserNavigateActiveTab,
    browserUpdateTab,
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
    browserTabFolders,
    tabTreeExpanded,
    allTreeExpanded,
    handleToggleTreePath,
    handleDeleteAllChildTabs,
    handleOpenAllInNewTabs,
    handleRemoveFromArea,
    handleDeleteDirectory,
    handleDeleteHistoryLevel,
    handleExpandAllTree,
    handleCollapseAllTree,
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

  const browserMenuItems = useMemo(
    () => [
      {
        id: 'hard-reload',
        label: t.browserHardReload,
        action: () => browserNavigateActiveTab(activeTab?.url ?? 'about:blank', activeTab?.title),
      },
      {
        id: 'copy-url',
        label: t.browserCopyCurrentUrl,
        action: () => void navigator.clipboard?.writeText(activeTab?.url ?? 'about:blank'),
      },
      { id: 'sep-1', separator: true as const },
      {
        id: 'clear-history',
        label: t.browserClearHistory,
        action: () => useAppStore.getState().browserClearHistory(),
      },
      { id: 'clear-cookies', label: t.browserClearCookies, disabled: true },
      { id: 'clear-cache', label: t.browserClearCache, disabled: true },
      { id: 'devtools', label: t.browserDeveloperTools, disabled: true },
      { id: 'sep-2', separator: true as const },
      { id: 'zoom-in', label: t.menuZoomIn, disabled: true },
      { id: 'zoom-out', label: t.menuZoomOut, disabled: true },
      { id: 'zoom-reset', label: t.menuZoomReset, disabled: true },
    ],
    [activeTab, browserNavigateActiveTab, t]
  );

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

  const submitAddress = useCallback(() => {
    const input = address.trim();
    if (!input) {
      return;
    }
    const matchedItem = findInBrowserLookupIndex(browserLookupIndex, input);
    if (matchedItem) {
      browserNavigateActiveTab(matchedItem.url, matchedItem.title);
      setAddress(matchedItem.url);
      navigateBrowser(matchedItem.url);
      return;
    }
    const normalizedValue = input.trim();
    const finalUrl = /^[a-z]+:\/\/|about:/i.test(normalizedValue)
      ? normalizedValue
      : `https://${normalizedValue}`;
    browserNavigateActiveTab(finalUrl);
    navigateBrowser(finalUrl);
  }, [address, browserLookupIndex, browserNavigateActiveTab, navigateBrowser]);

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

  const handleBookmarkAddToFolder = useCallback(
    (folderPath: string | null) => {
      if (!folderPath) {
        showToast(t.browserSelectDirFirst, 'warning');
        return;
      }
      if (!activeTab?.id) {
        showToast(t.browserSelectDirFirst, 'warning');
        return;
      }

      if (folderPath.startsWith('folder:')) {
        // 选择了普通文件夹
        const folderId = folderPath.slice('folder:'.length);
        useAppStore.getState().browserBookmarkTab(activeTab.id, folderId);
        showToast(t.browserBookmarkAddedToast, 'success');
        setBookmarkDialogOpen(false);
      } else if (folderPath.startsWith('workspace:')) {
        // 选择了工作区目录，直接收藏到工作区顶级目录
        const workspaceId = folderPath.slice('workspace:'.length);
        useAppStore.getState().browserBookmarkTab(activeTab.id, undefined, undefined, workspaceId);
        showToast(t.browserBookmarkAddedToast, 'success');
        setBookmarkDialogOpen(false);
      } else {
        showToast(t.browserSelectDirFirst, 'warning');
      }
    },
    [activeTab, showToast, t]
  );

  const handleBookmarkCreateDir = useCallback((parentPath: string | null) => {
    setCreateDirDialog({ open: true, parentPath });
  }, []);

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

  const { handleGoBack, handleGoForward, handleReload } = useBrowserNavigation({
    iframeRef,
    iframeHistory,
    navigateBrowser,
  });

  const urlState = useBrowserUrlState({
    address,
    addressExpanded,
    addressSearchRef,
    addressInputRef,
    setAddress,
    setAddressExpanded,
    submitAddress,
    activeTabUrl: activeTab?.url,
  });

  useEffect(() => {
    const url = activeTab?.url ?? '';
    requestAnimationFrame(() => {
      setAddress(url);
      setIframeLoadError(false);
    });

    if (!isTauriShell() && url && url !== '') {
      requestAnimationFrame(() => {
        setIframeHistory((prev) => {
          if (prev.entries[prev.index] === url) {
            return prev;
          }
          const newEntries = prev.entries.slice(0, prev.index + 1);
          newEntries.push(url);
          if (newEntries.length > 50) {
            newEntries.shift();
          }
          return { index: newEntries.length - 1, entries: newEntries };
        });
      });
    }
  }, [activeTab?.url, setAddress, setIframeLoadError, setIframeHistory]);

  useEffect(() => {
    if (!browserMenuOpen && !addressExpanded && navigatorMode !== 'search') {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!browserMenuRef.current?.contains(target)) {
        setBrowserMenuOpen(false);
      }
      if (!addressSearchRef.current?.contains(target)) {
        setAddressExpanded(false);
      }
      if (navigatorMode === 'search' && !navigatorSearchRef.current?.contains(target)) {
        setNavigatorMode('bookmarks');
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [
    addressExpanded,
    browserMenuOpen,
    browserMenuRef,
    addressSearchRef,
    navigatorMode,
    navigatorSearchRef,
    setBrowserMenuOpen,
    setAddressExpanded,
    setNavigatorMode,
  ]);

  useEffect(() => {
    if (addressExpanded) {
      addressInputRef.current?.focus();
      addressInputRef.current?.select();
    }
  }, [addressExpanded, addressInputRef]);

  useEffect(() => {
    if (navigatorMode === 'search') {
      navigatorSearchInputRef.current?.focus();
      navigatorSearchInputRef.current?.select();
    }
  }, [navigatorMode, navigatorSearchInputRef]);

  return (
    <div className="adl-tool-panel adl-tool-panel--browser">
      <BrowserToolbar
        t={t}
        navigatorCollapsed={navigatorCollapsed}
        address={urlState.address}
        addressExpanded={urlState.addressExpanded}
        addressSearchRef={urlState.addressSearchRef}
        addressInputRef={urlState.addressInputRef}
        activeTab={activeTab}
        isBookmarked={isBookmarked}
        browserMenuOpen={browserMenuOpen}
        browserMenuRef={browserMenuRef}
        browserMenuItems={browserMenuItems}
        onToggleNavigator={() => toggleNavigator('browser')}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        onReload={handleReload}
        onAddressChange={urlState.handleAddressChange}
        onAddressKeyDown={urlState.handleAddressKeyDown}
        onAddressBlur={urlState.handleAddressBlur}
        onSearchClick={urlState.handleSearchClick}
        onCopyUrl={urlState.handleCopyUrl}
        onNewTab={() => browserOpenTab()}
        onOpenBookmarkDialog={handleOpenBookmarkDialog}
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
        <aside className="adl-tool-navigator" aria-label={t.toolBrowser}>
          <div className="adl-tool-navigator__context">
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
              <TooltipSimple
                content={allTreeExpanded ? t.collapseAll : t.expandAll}
                placement="top"
              >
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={allTreeExpanded ? handleCollapseAllTree : handleExpandAllTree}
                  aria-label={allTreeExpanded ? t.collapseAll : t.expandAll}
                >
                  {allTreeExpanded ? (
                    <IconFoldVertical size={14} decorative />
                  ) : (
                    <IconUnfoldVertical size={14} decorative />
                  )}
                </button>
              </TooltipSimple>
              <span className="adl-tool-navigator__context-title">{navigatorTitle}</span>
            </div>
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility">
              <span className="adl-tool-navigator__context-count">{openTabCount}</span>
              <TooltipSimple
                content={browserShowTabButtons ? t.back : t.browserViewModeDefault}
                placement="top"
              >
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${browserShowTabButtons ? ' is-active' : ''}`}
                  onClick={handleToggleTabButtons}
                  aria-label={browserShowTabButtons ? t.back : t.browserViewModeDefault}
                >
                  {browserShowTabButtons ? (
                    <IconReturn size={14} decorative />
                  ) : (
                    <IconList size={14} decorative />
                  )}
                </button>
              </TooltipSimple>
            </div>
          </div>
          <div className="adl-tool-navigator__context adl-tool-navigator__context--secondary">
            {browserShowTabButtons ? (
              <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
                <TooltipSimple content={t.browserViewModeTree} placement="top">
                  <button
                    type="button"
                    className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${browserViewMode === 'tree' ? ' is-active' : ''}`}
                    onClick={() => handleSetBrowserViewMode('tree')}
                    aria-label={t.browserViewModeTree}
                    aria-pressed={browserViewMode === 'tree' ? 'true' : 'false'}
                  >
                    <IconFolder size={14} decorative />
                  </button>
                </TooltipSimple>
                <TooltipSimple content={t.browserViewModeList} placement="top">
                  <button
                    type="button"
                    className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${browserViewMode === 'list' ? ' is-active' : ''}`}
                    onClick={() => handleSetBrowserViewMode('list')}
                    aria-label={t.browserViewModeList}
                    aria-pressed={browserViewMode === 'list' ? 'true' : 'false'}
                  >
                    <IconList size={14} decorative />
                  </button>
                </TooltipSimple>
                <TooltipSimple content={t.browserViewModeAll} placement="top">
                  <button
                    type="button"
                    className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${browserViewMode === 'all' ? ' is-active' : ''}`}
                    onClick={() => handleSetBrowserViewMode('all')}
                    aria-label={t.browserViewModeAll}
                    aria-pressed={browserViewMode === 'all' ? 'true' : 'false'}
                  >
                    <IconLayoutList size={14} decorative />
                  </button>
                </TooltipSimple>
              </div>
            ) : (
              <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
                <TooltipSimple content={t.browserTabDir} placement="top">
                  <button
                    type="button"
                    className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${navigatorMode === 'tabs' && (browserViewMode === 'default' || browserShowTabButtons) ? ' is-active' : ''}`}
                    onClick={() => {
                      setNavigatorMode('tabs');
                      setBrowserViewMode('default');
                    }}
                    aria-label={t.browserTabDir}
                    aria-pressed={
                      navigatorMode === 'tabs' &&
                      (browserViewMode === 'default' || browserShowTabButtons)
                        ? 'true'
                        : 'false'
                    }
                  >
                    <IconFolder size={14} decorative />
                  </button>
                </TooltipSimple>
                <TooltipSimple content={t.browserViewModeList} placement="top">
                  <button
                    type="button"
                    className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${browserViewMode === 'list' && !browserShowTabButtons ? ' is-active' : ''}`}
                    onClick={handleDirectListView}
                    aria-label={t.browserViewModeList}
                    aria-pressed={
                      browserViewMode === 'list' && !browserShowTabButtons ? 'true' : 'false'
                    }
                  >
                    <IconList size={14} decorative />
                  </button>
                </TooltipSimple>
                <TooltipSimple content={t.browserSearchTabs} placement="top">
                  <button
                    type="button"
                    className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${navigatorMode === 'search' ? ' is-active' : ''}`}
                    onClick={() => setNavigatorMode('search')}
                    aria-label={t.browserSearchTabs}
                    aria-pressed={navigatorMode === 'search' ? 'true' : 'false'}
                  >
                    <IconSearch size={14} decorative />
                  </button>
                </TooltipSimple>
              </div>
            )}
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility">
              <TooltipSimple content={t.browserNewTab} placement="top">
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={() => {
                    const path = selectedTreePathRef.current;
                    if (!path || (!path.startsWith('folder:') && !path.startsWith('workspace:'))) {
                      showToast(t.browserSelectDirFirst, 'warning');
                      return;
                    }
                    let wsId: string | undefined;
                    if (path.startsWith('workspace:')) {
                      wsId = path.slice('workspace:'.length);
                    } else if (path.startsWith('folder:')) {
                      const fid = path.slice('folder:'.length);
                      wsId = resolveFolderWorkspaceId(fid, browserTabFolders);
                    }
                    setCreateTabDialog({ open: true, workspaceId: wsId });
                  }}
                  aria-label={t.browserNewTab}
                >
                  <IconPlus size={14} decorative />
                </button>
              </TooltipSimple>
              {!browserShowTabButtons && (
                <TooltipSimple content={t.browserCreateDir} placement="top">
                  <button
                    type="button"
                    className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                    onClick={() => {
                      const path = selectedTreePathRef.current;
                      setCreateDirDialog({ open: true, parentPath: path });
                    }}
                    aria-label={t.browserCreateDir}
                  >
                    <IconFolderPlus size={14} decorative />
                  </button>
                </TooltipSimple>
              )}
              <TooltipSimple
                content={browserShowTabButtons ? t.clearAllOpenTabs : t.deleteAllTabDirs}
                placement="top"
              >
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={() => handleCloseAllTabs()}
                  aria-label={browserShowTabButtons ? t.clearAllOpenTabs : t.deleteAllTabDirs}
                >
                  <IconTrash size={14} decorative />
                </button>
              </TooltipSimple>
            </div>
          </div>
          {navigatorMode === 'tabs' ? (
            <BrowserTabTree
              workspaces={visibleWorkspaces}
              browserTabs={browserTabs}
              browserTabFolders={browserTabFolders}
              browserHistory={browserHistory}
              browserWorkspaceBookmarks={browserWorkspaceBookmarks}
              tabTreeExpanded={tabTreeExpanded}
              selectedTreePath={selectedTreePath}
              onSelectTreePath={handleSelectTreePath}
              onTogglePath={handleToggleTreePath}
              browserViewMode={browserViewMode !== 'default' ? browserViewMode : undefined}
              callbacks={{
                onCreateTab: (workspaceId?: string, _folderId?: string) => {
                  setCreateTabDialog({ open: true, workspaceId });
                },
                onDeleteAllChildTabs: handleDeleteAllChildTabs,
                onOpenAllInNewTabs: handleOpenAllInNewTabs,
                onRemoveFromArea: handleRemoveFromArea,
                onDeleteDirectory: handleDeleteDirectory,
                onRenameDirectory: (folderId: string) => {
                  const folder = browserTabFolders.find((f) => f.id === folderId);
                  setRenameFolderState({ open: true, folderId, currentName: folder?.name ?? '' });
                },
                onDeleteHistory: handleDeleteHistoryLevel,
                onOpenTab: (url: string, tabId?: string) => {
                  if (tabId) {
                    const tab = browserTabs.find((t) => t.id === tabId);
                    if (tab) {
                      useAppStore.getState().browserSelectTab(tabId);
                      return;
                    }
                  }
                  browserOpenTab(url, undefined, undefined);
                },
              }}
              labels={{
                workspaceCategory: t.browserCategoryWorkspace,
                userFolderCategory: t.browserCategoryUserFolder,
                historyCategory: t.browserCategoryHistory,
              }}
            />
          ) : navigatorMode === 'search' ? (
            <div className="adl-tool-navigator__content">
              <div className="adl-tool-navigator__context adl-tool-navigator__context--search">
                <div
                  className="adl-tool-navigator__summary-stats"
                  role="tablist"
                  aria-label={t.browserSearchTabs}
                >
                  <button
                    type="button"
                    className={`adl-tool-navigator__summary-stat${searchScope === 'bookmarks' ? ' is-active' : ''}`}
                    onClick={() => setSearchScope('bookmarks')}
                    aria-pressed={searchScope === 'bookmarks'}
                    aria-label={t.browserSearchBookmarks}
                  >
                    <span className="adl-tool-navigator__summary-label">
                      {t.browserSearchBookmarks}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`adl-tool-navigator__summary-stat${searchScope === 'history' ? ' is-active' : ''}`}
                    onClick={() => setSearchScope('history')}
                    aria-pressed={searchScope === 'history'}
                    aria-label={t.browserSearchHistory}
                  >
                    <span className="adl-tool-navigator__summary-label">
                      {t.browserSearchHistory}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`adl-tool-navigator__summary-stat${searchScope === 'all' ? ' is-active' : ''}`}
                    onClick={() => setSearchScope('all')}
                    aria-pressed={searchScope === 'all'}
                    aria-label={t.browserSearchAll}
                  >
                    <span className="adl-tool-navigator__summary-label">{t.browserSearchAll}</span>
                  </button>
                </div>
                <label className="adl-tool-search adl-tool-search--navigator">
                  <IconSearch size={12} decorative />
                  <input
                    ref={navigatorSearchInputRef}
                    type="search"
                    value={navigatorQuery}
                    onChange={(event) => setNavigatorQuery(event.target.value)}
                    placeholder={t.searchPlaceholder}
                    aria-label={t.search}
                  />
                </label>
              </div>
              <CustomScrollArea
                shellClassName="adl-browser-search-results"
                scrollClassName="adl-browser-search-results-scroll"
                scrollbarClassName="adl-browser-search-results-scrollbar"
                thumbClassName="adl-browser-search-results-scrollbar__thumb"
              >
                {searchResults.length > 0 ? (
                  searchResults.map((item, index) => (
                    <SearchResultItem
                      key={`${item.url}-${index}`}
                      item={item}
                      onClick={() => browserOpenTab(item.url, item.title)}
                    />
                  ))
                ) : navigatorQuery.trim() ? (
                  <div className="adl-multitree__empty">
                    <p className="adl-empty-hint">{t.searchNoResults}</p>
                  </div>
                ) : (
                  <div className="adl-multitree__empty">
                    <p className="adl-empty-hint">{t.searchBookmarkHistoryHint}</p>
                  </div>
                )}
              </CustomScrollArea>
            </div>
          ) : null}
          <NavigatorResizeHandle
            label="Resize browser navigator"
            minWidth={180}
            maxWidth={300}
            currentWidth={browserNavigatorWidth}
            onPointerDown={handleNavigatorResizeStart}
          />
        </aside>

        <div className="adl-tool-primary adl-tool-primary--browser" ref={primaryRef}>
          <div className="adl-tool-primary__scroll adl-tool-primary__scroll--browser" />

          {!hasActiveTab || !activeTab?.url || activeTab?.url === 'about:blank' ? (
            <BrowserLandingPage t={t} />
          ) : (
            <>
              {!isTauriShell() && activeTab && (
                <iframe
                  ref={iframeRef}
                  src={activeTab.url}
                  className="adl-browser-iframe"
                  title={activeTab.title}
                  onLoad={handleIframeLoad}
                  onError={handleIframeError}
                  sandbox="allow-scripts allow-forms allow-popups allow-modals allow-top-navigation allow-same-origin"
                  style={{ display: isBrowserVisible ? undefined : 'none' }}
                />
              )}

              {!isTauriShell() && iframeLoadError && (
                <div className="adl-browser-error-container">
                  <p className="adl-browser-error-text">{t.browserCannotOpenEmbedded}</p>
                </div>
              )}

              <button
                type="button"
                className={`adl-browser-external-btn ${iframeLoadError ? 'adl-browser-external-btn--prominent' : ''}`}
                onClick={() => {
                  const url = activeTab?.url ?? 'about:blank';
                  if (isTauriShell()) {
                    shellOpen(url).catch((err) =>
                      console.error('Failed to open external browser:', err)
                    );
                  } else {
                    const w = window as { trae?: { openExternal: (url: string) => void } };
                    if (w.trae?.openExternal) {
                      w.trae.openExternal(url);
                    } else {
                      window.open(url, '_blank', 'noopener,noreferrer');
                    }
                  }
                }}
              >
                {t.browserOpenExternal}
              </button>
            </>
          )}
        </div>
      </div>

      <BrowserContextMenu
        contextMenu={contextMenu}
        onTogglePin={handleTogglePin}
        onRename={handleRenameFromContextMenu(browserTabs, contextMenu, handleDoubleClick)}
        onDelete={handleDeleteFromContextMenu(contextMenu, handleCloseTab)}
        onCopyUrl={handleCopyUrlFromMenu}
        onOpenInNewTab={handleOpenInNewTab}
        onOpenInCurrentTab={handleOpenInCurrentTab}
        onEdit={handleRenameFromContextMenu(browserTabs, contextMenu, handleDoubleClick)}
        onCut={() => {}}
      />

      <CreateTabDialog
        open={createTabDialog.open}
        t={t}
        onConfirm={handleCreateTabConfirm}
        onCancel={handleCreateTabCancel}
      />

      <BookmarkToFolderDialog
        open={bookmarkDialogOpen}
        t={t}
        workspaceNodes={bookmarkTreeData.workspaceNodes}
        userFolderNodes={bookmarkTreeData.userFolderNodes}
        onAddToFolder={handleBookmarkAddToFolder}
        onCreateDir={handleBookmarkCreateDir}
        onCancel={() => setBookmarkDialogOpen(false)}
      />

      <RenameDialog
        open={renameFolderState.open}
        initialValue={renameFolderState.currentName}
        title={t.browserRenamePrompt as string}
        placeholder={t.browserRenamePrompt as string}
        onConfirm={(name) => {
          useAppStore.getState().browserUpdateTabFolder(renameFolderState.folderId, { name });
          setRenameFolderState((prev) => ({ ...prev, open: false }));
        }}
        onCancel={() => setRenameFolderState((prev) => ({ ...prev, open: false }))}
      />

      <RenameDialog
        open={createDirDialog.open}
        initialValue=""
        title={t.browserCreateDir as string}
        onConfirm={(name) => {
          const parentPath = createDirDialog.parentPath;
          if (parentPath?.startsWith('folder:')) {
            const folderId = parentPath.slice('folder:'.length);
            useAppStore.getState().browserCreateTabFolder(name, folderId, 'folder');
          } else if (parentPath?.startsWith('workspace:')) {
            const wsId = parentPath.slice('workspace:'.length);
            useAppStore.getState().browserCreateTabFolder(name, wsId, 'workspace');
          } else {
            useAppStore.getState().browserCreateTabFolder(name, undefined, undefined);
          }
          setCreateDirDialog({ open: false, parentPath: null });
        }}
        onCancel={() => setCreateDirDialog({ open: false, parentPath: null })}
      />

      <ToastContainer toasts={toastMessages} onRemove={removeToast} />
    </div>
  );
}
