import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RenameDialog } from '../../components/RenameDialog';
import { ToastContainer } from '../../components/Toast';
import { useBrowserToast } from './useBrowserToast';
import { useBrowserDialogs } from './useBrowserDialogs';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../stores/slicedStore';
import { useBrowserTabs } from './useBrowserTabs';
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
import { BrowserPanelContent } from './BrowserPanelContent';
import { isTauriShell } from '../../../tauri-bridge';
import { CreateTabDialog } from './browser-landing';
import type { BrowserPanelProps } from '../../regions/right-panel/types';
import { useTCopy } from '../../i18n/useTCopy';
import {
  handleRenameFromContextMenu,
  handleDeleteFromContextMenu,
  buildBookmarkDirectoryTree,
} from './browserPanelHelpers';
import { BookmarkToFolderDialog } from './BookmarkToFolderDialog';
import { checkEmbed, isEmbedBlocked } from './checkEmbed';
import { setCachedFavicon } from '../../utils/fetchPageMeta';
import { getGoogleFaviconUrl } from '../../utils/favicon';

export function BrowserPanel(props: BrowserPanelProps) {
  const { t } = useTCopy();

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

  const [navigatorMode, setNavigatorMode] = useState<BrowserNavigatorMode>('tabs');
  const [address, setAddress] = useState('');
  const [addressExpanded, setAddressExpanded] = useState(false);
  const addressSearchRef = useRef<HTMLLabelElement | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedTreePath, setSelectedTreePath] = useState<string | null>(null);
  const selectedTreePathRef = useRef<string | null>(null);

  const { toastMessages, showToast, removeToast } = useBrowserToast();

  const validatedUrlsRef = useRef(new Set<string>());
  const activatedTabIdsRef = useRef(new Set<string>());
  const [, forceRender] = useState(0);
  const submitVersionRef = useRef(0);
  const pendingNavigationsRef = useRef<Set<string>>(new Set());
  const addressSubmittedForTabRef = useRef('');

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

  useEffect(() => {
    const handleWindowBlur = () => {
      if (selectedTreePathRef.current !== null) {
        handleSelectTreePath(null);
      }
    };
    window.addEventListener('blur', handleWindowBlur);
    return () => window.removeEventListener('blur', handleWindowBlur);
  }, [handleSelectTreePath]);

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

  const stopWebViewAudio = useCallback(() => {
    if (isTauriShell()) {
      invoke('browser_navigate', { url: 'about:blank' }).catch(() => {});
    } else {
      document.querySelectorAll<HTMLIFrameElement>('.adl-browser-iframe').forEach((el) => {
        try {
          el.src = 'about:blank';
        } catch {
          /* ignore */
        }
      });
    }
  }, []);

  const handleCloseAllTabs = useCallback(
    (workspaceId?: string) => {
      _handleCloseAllTabs(workspaceId);
      if (!workspaceId) {
        stopWebViewAudio();
      }
    },
    [_handleCloseAllTabs, stopWebViewAudio]
  );

  const wrappedHandleCloseTab = useCallback(
    (tabId: string) => {
      const state = useAppStore.getState();
      const remaining = state.browserTabs.length;
      handleCloseTab(tabId);
      if (remaining <= 1) {
        stopWebViewAudio();
      }
    },
    [handleCloseTab, stopWebViewAudio]
  );

  const handleClearTabDirectories = useCallback(() => {
    _handleClearTabDirectories();
  }, [_handleClearTabDirectories]);

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
    handleOpenBookmarkDialog,
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
    editTabDialog.open ||
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
    undefined,
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

  const submitAddress = useCallback(async () => {
    const input = address.trim();
    if (!input) {
      addressSubmittedForTabRef.current = 'about:blank';
      setAddress('');
      useAppStore.getState().setShowLandingPage(true);
      return;
    }

    addressSubmittedForTabRef.current = '';
    useAppStore.getState().setShowLandingPage(false);
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
            useAppStore.getState().browserAddToHistory(finalUrl, finalUrl);
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
          if (meta.title) {
            useAppStore.getState().browserAddToHistory(finalUrl, meta.title);
          } else {
            useAppStore.getState().browserAddToHistory(finalUrl, finalUrl);
          }
        });
      });
    }
  }, [
    address,
    browserLookupIndex,
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

  const { handleGoBack, handleGoForward, handleReload } = useBrowserNavigation({
    iframeRef,
    iframeHistory,
    navigateBrowser,
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

  useEffect(() => {
    const url = activeTab?.url ?? '';
    addressSubmittedForTabRef.current = url || 'about:blank';
    setAddress(url === 'about:blank' ? '' : url);

    if (url && url !== '' && url !== 'about:blank') {
      useAppStore.getState().setShowLandingPage(false);
    }

    if (!isTauriShell() && url && url !== '' && url !== 'about:blank') {
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
  }, [activeTab?.id, activeTab?.url, setAddress, setIframeHistory]);

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
        const isModeBtn = (target as HTMLElement).closest(
          '.adl-tool-navigator__context--secondary .adl-tool-context__iconbtn'
        );
        if (!isModeBtn) {
          setNavigatorMode('tabs');
        }
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
        browserMenuOpen={browserMenuOpen}
        browserMenuRef={browserMenuRef}
        browserMenuItems={browserMenuItems}
        setBrowserMenuOpen={setBrowserMenuOpen}
        activatedTabIdsRef={activatedTabIdsRef}
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

      <CreateTabDialog
        open={createTabDialog.open || editTabDialog.open}
        loading={createTabDialog.open ? isCreatingTab : false}
        t={t}
        initialName={editTabDialog.open ? editTabDialog.name : undefined}
        initialUrl={editTabDialog.open ? editTabDialog.url : undefined}
        onConfirm={createTabDialog.open ? handleCreateTabConfirm : handleEditTabConfirm}
        onCancel={createTabDialog.open ? handleCreateTabCancel : handleEditTabCancel}
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
