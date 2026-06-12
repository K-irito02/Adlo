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
  IconGlobe,
} from '../../icons';
import { TooltipSimple } from '../../components/Tooltip';
import { RenameDialog } from '../../components/RenameDialog';
import { ToastContainer, type ToastType } from '../../components/Toast';
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

function resolveFolderWorkspaceId(
  folderId: string,
  folders: Array<{ id: string; parentId?: string; parentType?: 'workspace' | 'folder' }>
): string | undefined {
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) {
    return undefined;
  }
  if (folder.parentType === 'workspace') {
    return folder.parentId;
  }
  if (folder.parentType === 'folder' && folder.parentId) {
    return resolveFolderWorkspaceId(folder.parentId, folders);
  }
  return undefined;
}

function handleRenameFromContextMenu(
  browserTabs: Array<{ id: string; title: string }>,
  contextMenu: { tabId: string | null },
  handleDoubleClick: (tabId: string, title: string) => void
): () => void {
  return () => {
    if (contextMenu.tabId) {
      const tab = browserTabs.find((t) => t.id === contextMenu.tabId);
      if (tab) {
        handleDoubleClick(contextMenu.tabId, tab.title);
      }
    }
  };
}

function handleDeleteFromContextMenu(
  contextMenu: { tabId: string | null },
  handleCloseTab: (tabId: string) => void
): () => void {
  return () => {
    if (contextMenu.tabId) {
      handleCloseTab(contextMenu.tabId);
    }
  };
}

function SearchResultItem({
  item,
  onClick,
}: {
  item: { title: string; url: string; source?: string };
  onClick: () => void;
}) {
  return (
    <div
      className="adl-browser-search-result-item"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onClick();
        }
      }}
    >
      <IconGlobe size={14} decorative className="adl-browser-search-result-item__icon" />
      <div className="adl-browser-search-result-item__content">
        <div className="adl-browser-search-result-item__title">{item.title}</div>
        <div className="adl-browser-search-result-item__url">{item.url}</div>
      </div>
      {item.source && <div className="adl-browser-search-result-item__source">{item.source}</div>}
    </div>
  );
}

export function BrowserPanel(props: BrowserPanelProps) {
  const { t } = props;

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
    _editingTabId,
    _editValue,
    _editInputRef,
    handleDoubleClick,
    _handleCreateTab,
    _handleSelectTab,
    handleCloseTab,
    handleCloseAllTabs,
    _handleEditSubmit,
    _handleEditKeyDown,
    handleToggleBookmark,
    _setEditValue,
    _setEditingTabId,
  } = useBrowserTabs();

  const {
    iframeLoadError,
    setIframeLoadError,
    iframeHistory,
    setIframeHistory,
    iframeRef,
    primaryRef,
    navigateBrowser,
    _updateWebViewBounds,
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
    t,
    browserBookmarks,
    browserHistory,
    browserTabs,
  });

  const {
    browserTabFolders,
    tabTreeExpanded,
    allTreeExpanded,
    _handleCreateTabInTree,
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
    t,
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

  const navigatorCount = computeNavigatorCount(
    navigatorMode,
    navigatorQuery,
    browserTabs,
    browserBookmarks,
    browserHistory,
    searchResults,
    [],
    []
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
        tree: '文件树',
        list: '文件列表',
        all: '全列表',
      };
      return modeLabels[browserViewMode] || '已打开标签';
    }
    return rawNavigatorTitle;
  }, [browserShowTabButtons, browserViewMode, rawNavigatorTitle]);

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
        onToggleBookmark={handleToggleBookmark}
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
              <TooltipSimple content={allTreeExpanded ? '全部折叠' : '全部展开'} placement="top">
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={allTreeExpanded ? handleCollapseAllTree : handleExpandAllTree}
                  aria-label={allTreeExpanded ? '全部折叠' : '全部展开'}
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
                content={browserShowTabButtons ? '后退' : '已打开标签'}
                placement="top"
              >
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${browserShowTabButtons ? ' is-active' : ''}`}
                  onClick={handleToggleTabButtons}
                  aria-label={browserShowTabButtons ? '后退' : '已打开标签'}
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
                <TooltipSimple content="文件树" placement="top">
                  <button
                    type="button"
                    className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${browserViewMode === 'tree' ? ' is-active' : ''}`}
                    onClick={() => handleSetBrowserViewMode('tree')}
                    aria-label="文件树"
                    aria-pressed={browserViewMode === 'tree' ? 'true' : 'false'}
                  >
                    <IconFolder size={14} decorative />
                  </button>
                </TooltipSimple>
                <TooltipSimple content="文件列表" placement="top">
                  <button
                    type="button"
                    className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${browserViewMode === 'list' ? ' is-active' : ''}`}
                    onClick={() => handleSetBrowserViewMode('list')}
                    aria-label="文件列表"
                    aria-pressed={browserViewMode === 'list' ? 'true' : 'false'}
                  >
                    <IconList size={14} decorative />
                  </button>
                </TooltipSimple>
                <TooltipSimple content="全列表" placement="top">
                  <button
                    type="button"
                    className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${browserViewMode === 'all' ? ' is-active' : ''}`}
                    onClick={() => handleSetBrowserViewMode('all')}
                    aria-label="全列表"
                    aria-pressed={browserViewMode === 'all' ? 'true' : 'false'}
                  >
                    <IconLayoutList size={14} decorative />
                  </button>
                </TooltipSimple>
              </div>
            ) : (
              <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
                <TooltipSimple content="标签目录" placement="top">
                  <button
                    type="button"
                    className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${navigatorMode === 'tabs' ? ' is-active' : ''}`}
                    onClick={() => setNavigatorMode('tabs')}
                    aria-label="标签目录"
                    aria-pressed={navigatorMode === 'tabs' ? 'true' : 'false'}
                  >
                    <IconFolder size={14} decorative />
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
              <TooltipSimple content="新建标签" placement="top">
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={() => {
                    const path = selectedTreePathRef.current;
                    if (!path || (!path.startsWith('folder:') && !path.startsWith('workspace:'))) {
                      showToast('请先选择一个目录', 'warning');
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
                  aria-label="新建标签"
                >
                  <IconPlus size={14} decorative />
                </button>
              </TooltipSimple>
              {!browserShowTabButtons && (
                <TooltipSimple content="新建目录" placement="top">
                  <button
                    type="button"
                    className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                    onClick={() => {
                      const path = selectedTreePathRef.current;
                      if (path && path.startsWith('folder:')) {
                        const folderId = path.slice('folder:'.length);
                        useAppStore
                          .getState()
                          .browserCreateTabFolder(undefined, folderId, 'folder');
                      } else if (path && path.startsWith('workspace:')) {
                        const wsId = path.slice('workspace:'.length);
                        useAppStore.getState().browserCreateTabFolder(undefined, wsId, 'workspace');
                      } else {
                        useAppStore
                          .getState()
                          .browserCreateTabFolder(undefined, undefined, undefined);
                      }
                    }}
                    aria-label="新建目录"
                  >
                    <IconFolderPlus size={14} decorative />
                  </button>
                </TooltipSimple>
              )}
              <TooltipSimple
                content={browserShowTabButtons ? '清空所有已打开标签' : '删除全部目录标签'}
                placement="top"
              >
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={() => handleCloseAllTabs()}
                  aria-label={browserShowTabButtons ? '清空所有已打开标签' : '删除全部目录标签'}
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
              tabTreeExpanded={tabTreeExpanded}
              selectedTreePath={selectedTreePath}
              onSelectTreePath={handleSelectTreePath}
              onTogglePath={handleToggleTreePath}
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
                workspaceCategory: '工作区目录',
                userFolderCategory: '非工作区目录',
                historyCategory: '历史目录',
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
                    <p className="adl-empty-hint">没有找到匹配的结果</p>
                  </div>
                ) : (
                  <div className="adl-multitree__empty">
                    <p className="adl-empty-hint">输入关键词搜索书签和历史记录</p>
                  </div>
                )}
              </CustomScrollArea>
            </div>
          ) : null}
          <div
            className="adl-tool-navigator__resize-handle"
            onPointerDown={handleNavigatorResizeStart}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize browser navigator"
            aria-valuemin={180}
            aria-valuemax={300}
            aria-valuenow={browserNavigatorWidth}
          />
        </aside>

        <div className="adl-tool-primary adl-tool-primary--browser" ref={primaryRef}>
          <div className="adl-tool-primary__scroll adl-tool-primary__scroll--browser" />

          {!hasActiveTab || !activeTab?.url || activeTab?.url === 'about:blank' ? (
            <BrowserLandingPage t={t} />
          ) : (
            <>
              {!isTauriShell() && activeTab && isBrowserVisible && (
                <iframe
                  ref={iframeRef}
                  src={activeTab.url}
                  className="adl-browser-iframe"
                  title={activeTab.title}
                  onLoad={handleIframeLoad}
                  onError={handleIframeError}
                  sandbox="allow-scripts allow-forms allow-popups allow-modals allow-top-navigation allow-same-origin"
                />
              )}

              {!isTauriShell() && iframeLoadError && (
                <div className="adl-browser-error-container">
                  <p className="adl-browser-error-text">
                    该网站无法在嵌入式视图中打开，这通常是由于网站的安全策略导致的。
                  </p>
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
        t={t}
      />

      <CreateTabDialog
        open={createTabDialog.open}
        t={t}
        onConfirm={handleCreateTabConfirm}
        onCancel={handleCreateTabCancel}
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

      <ToastContainer toasts={toastMessages} onRemove={removeToast} />
    </div>
  );
}
