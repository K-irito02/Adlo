import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeIframe } from './SafeIframe';
import { RenameDialog } from '../../components/RenameDialog';
import { ToastContainer, type ToastType } from '../../components/Toast';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { ExternalLinkError } from './ExternalLinkError';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../stores/slicedStore';
import { useBrowserTabs, computeNavigatorCount } from './useBrowserTabs';
import type { BrowserNavigatorMode } from './useBrowserTabs';
import { useBrowserWebView } from './useBrowserWebView';
import { useBrowserUrlChange } from './useBrowserUrlChange';
import { useBrowserSearch, findInBrowserLookupIndex } from './useBrowserSearch';
import { useBrowserTreeActions } from './useBrowserTreeActions';
import { useBrowserNavigation } from './useBrowserNavigation';
import { useBrowserUrlState } from './useBrowserUrlState';
import { useBrowserPageMeta } from './useBrowserPageMeta';
import { useBrowserMetaSubscription } from './useBrowserMetaSubscription';
import { useBrowserMenus } from './useBrowserMenus';
import { BrowserContextMenu } from './BrowserContextMenu';
import { BrowserToolbar } from './BrowserToolbar';
import { BrowserNavigator } from './BrowserNavigator';
import { isTauriShell } from '../../../tauri-bridge';
import { BrowserLandingPage, CreateTabDialog } from './browser-landing';
import type { BrowserPanelProps } from '../../regions/right-panel/types';
import { useNavigatorResize } from '../../hooks/useNavigatorResize';
import { useTCopy } from '../../i18n/useTCopy';
import {
  handleRenameFromContextMenu,
  handleDeleteFromContextMenu,
  buildBookmarkDirectoryTree,
} from './browserPanelHelpers';
import { BookmarkToFolderDialog } from './BookmarkToFolderDialog';
import { checkEmbed, isEmbedBlocked } from './checkEmbed';
import {
  getCachedFavicon,
  setCachedFavicon,
  prefetchPageMeta,
  lockTabTitle,
} from '../../utils/fetchPageMeta';
import { getGoogleFaviconUrl } from '../../utils/favicon';
import { hostnameFromUrl } from '../../utils/browserDisplayUtils';

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
    browserNavigateInPlace,
    setBrowserNavigateInPlace,
    browserUpdateTab,
    recentWorkspaces,
    browserBookmarks,
    browserHistory,
    browserWorkspaceBookmarks,
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
      browserNavigateInPlace: state.browserNavigateInPlace,
      setBrowserNavigateInPlace: state.setBrowserNavigateInPlace,
      browserUpdateTab: state.browserUpdateTab,
      recentWorkspaces: state.recentWorkspaces,
      browserBookmarks: state.browserBookmarks,
      browserHistory: state.browserHistory,
      browserWorkspaceBookmarks: state.browserWorkspaceBookmarks,
    }))
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
    folderId?: string;
  }>({ open: false });
  const pendingFolderIdRef = useRef<string>('');

  const [isCreatingTab, setIsCreatingTab] = useState(false);

  const [bookmarkDialogOpen, setBookmarkDialogOpen] = useState(false);
  const validatedUrlsRef = useRef(new Set<string>());
  const [, forceRender] = useState(0);
  const submitVersionRef = useRef(0);
  const pendingNavigationsRef = useRef<Set<string>>(new Set());

  const handleToggleNavigateMode = useCallback(
    (checked: boolean) => {
      setBrowserNavigateInPlace(checked);
    },
    [setBrowserNavigateInPlace]
  );

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

  const handleCreateTabConfirm = useCallback(
    async (name: string, url: string) => {
      const { workspaceId } = createTabDialog;
      const folderId = pendingFolderIdRef.current;
      pendingFolderIdRef.current = '';
      // 用户显式提供了名称 → 立即创建标签
      if (name.trim()) {
        setCreateTabDialog({ open: false });
        browserOpenTab(url, name, folderId ? undefined : workspaceId, folderId || undefined);
        return;
      }
      // 未提供名称 → 预取页面元数据后再创建
      setIsCreatingTab(true);
      let title = '';
      try {
        const meta = await prefetchPageMeta(url);
        if (meta?.title?.trim()) {
          title = meta.title.trim();
          if (meta.favicon) {
            setCachedFavicon(url, meta.favicon, true);
          }
        }
      } catch {
        // fallback: use hostname
      }
      if (!title) {
        title = hostnameFromUrl(url) || url;
      }
      if (!getCachedFavicon(url)) {
        const googleFavicon = getGoogleFaviconUrl(url);
        if (googleFavicon) {
          setCachedFavicon(url, googleFavicon, true);
        }
      }
      setIsCreatingTab(false);
      setCreateTabDialog({ open: false });
      browserOpenTab(url, title, folderId ? undefined : workspaceId, folderId || undefined);
      const tabId = useAppStore.getState().browserActiveTabId;
      if (tabId) {
        lockTabTitle(tabId);
      }
    },
    [browserOpenTab, createTabDialog]
  );

  const handleCreateTabCancel = useCallback(() => {
    setCreateTabDialog({ open: false });
    pendingFolderIdRef.current = '';
  }, []);

  const handleSetCreateTabDialog = useCallback(
    (
      value: React.SetStateAction<{
        open: boolean;
        workspaceId?: string;
        folderId?: string;
      }>
    ) => {
      if (typeof value === 'function') {
        setCreateTabDialog((prev) => {
          const resolved = value(prev);
          pendingFolderIdRef.current = resolved.folderId ?? '';
          return resolved;
        });
      } else {
        pendingFolderIdRef.current = value.folderId ?? '';
        setCreateTabDialog(value);
      }
    },
    []
  );

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

  const hasOverlayActive =
    browserMenuOpen ||
    contextMenu.open ||
    createTabDialog.open ||
    bookmarkDialogOpen ||
    renameFolderState.open ||
    createDirDialog.open;

  const {
    iframeLoadError,
    setIframeLoadError,
    iframeBlockedDetected,
    setIframeBlockedDetected,
    iframeHistory,
    setIframeHistory,
    iframeRef,
    primaryRef,
    activeTabRef,
    expectedNavigationUrlRef,
    markUrlSeen,
    navigateBrowser,
    navigateTauriUrl,
    forceReloadTauri,
  } = useBrowserWebView({
    activeTab,
    webViewDisabled: false,
    isVisible: isBrowserVisible,
    overlayActive: hasOverlayActive,
    setAddress,
  });

  const { handlePageMeta: _handlePageMeta } = useBrowserPageMeta(
    pendingNavigationsRef,
    setToastMessages,
    showToast,
    markUrlSeen
  );

  useBrowserMetaSubscription(_handlePageMeta);

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

  const browserMenuItems = useMemo(
    () => [
      {
        id: 'hard-reload',
        label: t.browserHardReload,
        action: () => {
          if (isTauriShell() && activeTab?.url) {
            forceReloadTauri(activeTab.url);
          } else {
            const tabTitle =
              activeTab?.title && !/^https?:\/\//i.test(activeTab.title)
                ? activeTab.title
                : undefined;
            browserNavigateActiveTab(activeTab?.url ?? 'about:blank', tabTitle);
          }
        },
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
    [activeTab, browserNavigateActiveTab, forceReloadTauri, t]
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

  const submitAddress = useCallback(async () => {
    const input = address.trim();
    if (!input) {
      if (activeTab?.id && activeTab?.url) {
        browserUpdateTab(activeTab.id, { url: '' });
      }
      setAddress('');
      return;
    }
    const matchedItem = findInBrowserLookupIndex(browserLookupIndex, input);
    const finalUrl = matchedItem?.url
      ? matchedItem.url
      : /^[a-z]+:\/\/|about:/i.test(input.trim())
        ? input.trim()
        : `https://${input.trim()}`;

    const version = ++submitVersionRef.current;

    if (!isTauriShell()) {
      const cached = isEmbedBlocked(finalUrl);
      if (cached !== undefined) {
        if (submitVersionRef.current !== version) {
          return;
        }
        if (cached) {
          setIframeBlockedDetected(true);
          setIframeLoadError(true);
        } else {
          validatedUrlsRef.current.add(finalUrl);
        }
        if (!cached) {
          navigateBrowser(finalUrl);
        }
      } else {
        const blocked = await checkEmbed(finalUrl);
        if (submitVersionRef.current !== version) {
          return;
        }

        if (blocked) {
          setIframeBlockedDetected(true);
          setIframeLoadError(true);
        } else {
          validatedUrlsRef.current.add(finalUrl);
        }

        if (!blocked) {
          navigateBrowser(finalUrl);
        }
      }
    }

    // Always defer tab creation until real title arrives via handlePageMeta
    handleNavigationStart(finalUrl);
    setAddress(finalUrl);
    if (isTauriShell()) {
      navigateTauriUrl(finalUrl);
    }

    if (!isTauriShell() && finalUrl) {
      import('../../utils/fetchPageMeta').then((mod) => {
        mod.fetchPageMeta(finalUrl).then((meta) => {
          if (!meta) {
            return;
          }
          const tab = useAppStore
            .getState()
            .browserTabs.find(
              (t) => t.url === finalUrl && t.id === useAppStore.getState().browserActiveTabId
            );
          if (tab && meta.title && meta.title !== tab.title) {
            useAppStore.getState().browserUpdateTab(tab.id, { title: meta.title });
          }
          if (meta.favicon) {
            mod.setCachedFavicon(finalUrl, meta.favicon);
          }
        });
      });
    }
  }, [
    address,
    activeTab,
    browserLookupIndex,
    browserUpdateTab,
    handleNavigationStart,
    navigateBrowser,
    navigateTauriUrl,
    setIframeLoadError,
    setIframeBlockedDetected,
  ]);

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
  }, [activeTab?.url, setAddress, setIframeHistory]);

  // Validate active tab URL before allowing iframe to render
  // Handles page reload, bookmark/history clicks, and tab switches
  useEffect(() => {
    const url = activeTab?.url;
    if (!url || url === 'about:blank' || isTauriShell()) {
      return;
    }

    setIframeLoadError(false);
    setIframeBlockedDetected(false);

    if (validatedUrlsRef.current.has(url)) {
      return;
    }

    const cached = isEmbedBlocked(url);
    if (cached !== undefined) {
      if (cached) {
        setIframeBlockedDetected(true);
        setIframeLoadError(true);
      } else {
        validatedUrlsRef.current.add(url);
        forceRender((v) => v + 1);
      }
      return;
    }

    checkEmbed(url).then((blocked) => {
      if (blocked) {
        setIframeBlockedDetected(true);
        setIframeLoadError(true);
      } else {
        validatedUrlsRef.current.add(url);
        setIframeLoadError(false);
        setIframeBlockedDetected(false);
        forceRender((v) => v + 1);
      }
    });
  }, [activeTab?.url, setIframeBlockedDetected, setIframeLoadError, forceRender]);

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

  const isEmbedPending =
    !isTauriShell() &&
    !!activeTab?.url &&
    activeTab?.url !== 'about:blank' &&
    !validatedUrlsRef.current.has(activeTab.url ?? '') &&
    !iframeBlockedDetected &&
    !iframeLoadError;

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
        browserNavigateInPlace={browserNavigateInPlace}
        onToggleNavigateMode={handleToggleNavigateMode}
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
          onOpenAllInNewTabs={handleOpenAllInNewTabs}
          onRemoveFromArea={handleRemoveFromArea}
          onDeleteDirectory={handleDeleteDirectory}
          onDeleteHistoryLevel={handleDeleteHistoryLevel}
          onCloseAllTabs={handleCloseAllTabs}
          onOpenTab={browserOpenTab}
          onOpenTabFromTree={handleOpenTabFromTree}
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
          {!hasActiveTab || !activeTab?.url || activeTab?.url === 'about:blank' ? (
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
        loading={isCreatingTab}
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
