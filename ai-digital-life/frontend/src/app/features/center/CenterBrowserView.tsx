import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  IconArrowLeft,
  IconArrowRight,
  IconRefreshCw,
  IconGlobeSearch,
  IconSearchEngine,
  IconBookmarkStar,
  IconBookmarkStarFilled,
} from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { CopyButton } from '@components/CopyButton';
import { ErrorBoundary } from '@components/ErrorBoundary';
import { BrowserLandingPage } from '@features/browser/browser-landing';
import { BrowserIframeErrorOverlay } from '@features/browser/BrowserIframeErrorOverlay';
import { ExternalLinkError } from '@features/browser/ExternalLinkError';
import { BrowserDownloadButton } from '@features/browser/BrowserDownloadButton';
import { BrowserMenuDropdown } from '@features/browser/BrowserMenuDropdown';
import { SearchEnginePopover } from '@features/browser/SearchEnginePopover';
import { SafeIframe } from '@features/browser/SafeIframe';
import { useBrowserIframeState } from '@features/browser/useBrowserIframeState';
import { useBrowserNavigation } from '@features/browser/useBrowserNavigation';
import { useBrowserViewHost } from '@features/browser/useBrowserViewHost';
import { useBrowserUrlState } from '@features/browser/useBrowserUrlState';
import { useBrowserSearch } from '@features/browser/useBrowserSearch';
import { useBrowserPanelMenuItems } from '@features/browser/useBrowserPanelMenuItems';
import { useBrowserZoomState } from '@features/browser/useBrowserZoomState';
import { extractSearchQueryFromUrl } from '@features/browser/browserUrlUtils';
import { buildBookmarkDirectoryTree } from '@features/browser/browserPanelHelpers';
import { useBookmarkToFolderDialog } from '@features/browser/useBookmarkToFolderDialog';
import { BookmarkToFolderDialogs } from '@features/browser/BookmarkToFolderDialogs';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { useCenterBrowserAddressSubmit } from './useCenterBrowserAddressSubmit';
import { useCenterObscured } from './useCenterObscured';
import './CenterBrowserView.css';

interface CenterBrowserViewProps {
  browserTabId: string;
}

/**
 * 中心浏览器视图：承载一个 `location === 'center'` 的浏览器标签。
 *
 * 工具栏由既有叶子组件（CopyButton / BrowserDownloadButton / BrowserMenuDropdown /
 * SearchEnginePopover / icons）组合而成，而非参数化面板的 `BrowserToolbar`
 * （后者读 `BrowserPanelStateContext` / `BrowserPanelActionsContext`，忠实抽取
 * 风险高、且会触及面板回归面 —— 见 Ruling-10）。内容区在 Tauri 下由
 * `useBrowserViewHost({ hostId: 'center' })` 驱动原生 WebView；浏览器模式下渲染
 * 该标签自己的 iframe（`BrowserIframeStack` 依赖面板上下文，不可直接复用）。
 */
export function CenterBrowserView({ browserTabId }: CenterBrowserViewProps) {
  const { t } = useTCopy();

  const activeTab = useAppStore((s) =>
    browserTabId ? s.browserTabsById[browserTabId] : undefined,
  );
  const browserTabs = useAppStore((s) => s.browserTabs);
  const browserBookmarks = useAppStore((s) => s.browserBookmarks);
  const browserHistory = useAppStore((s) => s.browserHistory);
  const browserTabFolders = useAppStore((s) => s.browserTabFolders);
  const recentWorkspaces = useAppStore((s) => s.recentWorkspaces);
  const showToast = useAppStore((s) => s.showToast);
  const browserOpenTab = useAppStore((s) => s.browserOpenTab);
  const browserNavigateInPlace = useAppStore((s) => s.browserNavigateInPlace);
  const centerShowBrowserTab = useAppStore((s) => s.centerShowBrowserTab);
  const isTauri = useAppStore((s) => s.isTauri);
  const searchEngines = useAppStore((s) => s.searchEngines);
  const defaultSearchEngineId = useAppStore((s) => s.defaultSearchEngineId);
  const initializeSearchEngines = useAppStore((s) => s.initializeSearchEngines);

  // 地址栏草稿状态（瞬态，不落 store）
  const [address, setAddress] = useState('');
  const [addressExpanded, setAddressExpanded] = useState(false);
  const [searchQueryDisplay, setSearchQueryDisplay] = useState('');
  const addressSearchRef = useRef<HTMLLabelElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);

  const [browserMenuOpen, setBrowserMenuOpen] = useState(false);
  const browserMenuRef = useRef<HTMLDivElement>(null);

  const [searchEnginePopoverOpen, setSearchEnginePopoverOpen] = useState(false);
  const searchEngineBtnRef = useRef<HTMLButtonElement>(null);
  const [faviconError, setFaviconError] = useState(false);

  useEffect(() => {
    initializeSearchEngines();
  }, [initializeSearchEngines]);

  useEffect(() => {
    setFaviconError(false);
  }, [defaultSearchEngineId]);

  const {
    iframeRef,
    iframeLoadError,
    setIframeLoadError,
    iframeBlockedDetected,
    setIframeBlockedDetected,
    iframeHistory,
    navigateBrowser,
    validatedUrlsRef,
  } = useBrowserIframeState({ activeTab });

  const { handleGoBack, handleGoForward, handleReload, canGoBack, canGoForward } =
    useBrowserNavigation({
      iframeRef,
      iframeHistory,
      navigateBrowser,
      activeTabId: activeTab?.id,
    });

  const currentEngine = searchEngines.find((e) => e.id === defaultSearchEngineId);
  const isBookmarked = activeTab?.url
    ? browserBookmarks.some(
        (bookmark) => bookmark.url === activeTab.url && bookmark.title === activeTab.title,
      )
    : false;

  // 收藏标签流程（与右侧面板共用同一实现）：未收藏时点「收藏标签」打开目录选择
  // 对话框，已收藏时点击即取消收藏。目录树口径与面板一致（可见工作区 + 标签目录）。
  const visibleWorkspaces = useMemo(
    () => recentWorkspaces.filter((w) => !w.removedFromSidebar && w.available),
    [recentWorkspaces],
  );
  const bookmarkTreeData = useMemo(
    () => buildBookmarkDirectoryTree(visibleWorkspaces, browserTabFolders),
    [visibleWorkspaces, browserTabFolders],
  );
  const [createDirDialog, setCreateDirDialog] = useState<{
    open: boolean;
    parentPath: string | null;
  }>({ open: false, parentPath: null });

  const {
    bookmarkDialogOpen,
    bookmarkName,
    setBookmarkName,
    handleOpenBookmarkDialog,
    handleBookmarkAddToFolder,
    handleBookmarkCreateDir,
    handleCloseBookmarkDialog,
  } = useBookmarkToFolderDialog({
    t,
    activeTab,
    isBookmarked,
    showToast,
    onCreateDir: useCallback((parentPath: string | null) => {
      setCreateDirDialog({ open: true, parentPath });
    }, []),
    // 待收藏项投递（导航器条目树右键「收藏到目录」）唯一生产者是面板侧；中心订阅会
    // 与面板同时挂载时双弹窗，故关闭订阅。
    watchStorePending: false,
  });

  // 中心视图自己的浮层（菜单 / 地址栏展开 / 搜索引擎设置 / 收藏目录对话框）必须回传作为
  // overlayActive，否则这些浮层会被中心原生 WebView2 盖住（与面板宿主同语义）。
  const centerOverlayActive =
    browserMenuOpen ||
    addressExpanded ||
    searchEnginePopoverOpen ||
    bookmarkDialogOpen ||
    createDirDialog.open;

  // 右侧面板进入浮层态时会以 absolute 盖住中间区 —— DOM 盖不住原生 WebView2，
  // 必须主动把中心 WebView2 移出画面（否则原生表面反过来盖住右侧面板）。
  const centerObscured = useCenterObscured();

  const { containerRef, loadingTabId, isTabInPool, navigateTabInPool } = useBrowserViewHost({
    hostId: 'center',
    activeTab,
    isVisible: !centerObscured,
    webViewDisabled: centerObscured,
    overlayActive: centerOverlayActive,
  });

  const { browserLookupIndex } = useBrowserSearch({
    browserBookmarks,
    browserHistory,
    browserTabs,
  });

  const openCenterTab = useCallback(
    (url: string, title?: string) => {
      browserOpenTab(url, title, undefined, undefined);
      const newId = useAppStore.getState().browserActiveTabId;
      if (newId) {
        centerShowBrowserTab(newId);
      }
    },
    [browserOpenTab, centerShowBrowserTab],
  );

  const { submitAddress } = useCenterBrowserAddressSubmit({
    browserTabId,
    address,
    setAddress,
    setSearchQueryDisplay,
    browserLookupIndex,
    browserNavigateInPlace,
    navigateBrowser,
    navigateTabInPool,
    isTabInPool,
    setIframeLoadError,
    setIframeBlockedDetected,
    validatedUrlsRef,
    openCenterTab,
  });

  const activeTabUrl = activeTab?.url && activeTab.url !== 'about:blank' ? activeTab.url : '';

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

  // store 中的标签 URL 变化（Tauri 事件 / iframe 内导航 / 新建标签回填）→ 同步地址栏
  //（searchEngines 已在上层订阅，直接使用并列入 deps，不再经 getState() 快照读取）。
  useEffect(() => {
    const url = activeTab?.url ?? '';
    setAddress(url === 'about:blank' ? '' : url);
    setSearchQueryDisplay(url ? extractSearchQueryFromUrl(url, searchEngines) : '');
  }, [activeTab?.id, activeTab?.url, searchEngines]);

  // 菜单 / 地址栏展开态：点击外部关闭
  useEffect(() => {
    if (!browserMenuOpen && !addressExpanded) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (browserMenuRef.current && !browserMenuRef.current.contains(target)) {
        setBrowserMenuOpen(false);
      }
      if (addressSearchRef.current && !addressSearchRef.current.contains(target)) {
        setAddressExpanded(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [browserMenuOpen, addressExpanded]);

  const { zoomLevel, setZoomLevel } = useBrowserZoomState({ activeTabId: activeTab?.id });
  const { browserMenuItems } = useBrowserPanelMenuItems({
    activeTab,
    hardReload: handleReload,
    zoomLevel,
    setZoomLevel,
    t,
  });

  const handleBookmarkClick = useCallback(() => {
    const tab = useAppStore.getState().browserTabsById[browserTabId];
    if (!tab?.url) {
      return;
    }
    handleOpenBookmarkDialog();
  }, [handleOpenBookmarkDialog, browserTabId]);

  const handleIframeLoad = useCallback(() => {
    setIframeLoadError(false);
    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }
    let href: string | undefined;
    try {
      href = iframe.contentWindow?.location.href;
    } catch {
      // 跨域：无法读取内部 URL，交由页面元数据链路处理
      return;
    }
    if (!href || href === 'about:blank') {
      return;
    }
    const tab = useAppStore.getState().browserTabsById[browserTabId];
    if (tab && href !== tab.url) {
      useAppStore.getState().browserUpdateTab(browserTabId, { url: href });
    }
  }, [browserTabId, iframeRef, setIframeLoadError]);

  const handleIframeError = useCallback(() => {
    setIframeLoadError(true);
  }, [setIframeLoadError]);

  const handleLandingOpenUrl = useCallback((url: string) => openCenterTab(url), [openCenterTab]);

  const isEmptyUrl = !activeTab?.url || activeTab.url === 'about:blank';
  const isEmbedPending =
    !isTauri &&
    !!activeTab?.url &&
    activeTab.url !== 'about:blank' &&
    !validatedUrlsRef.current.has(activeTab.url) &&
    !iframeBlockedDetected &&
    !iframeLoadError;
  const showIframe =
    !isTauri && !isEmptyUrl && !!activeTab?.url && validatedUrlsRef.current.has(activeTab.url);

  const engineFavicon = useMemo(
    () => (!faviconError && currentEngine?.faviconUrl ? currentEngine.faviconUrl : null),
    [faviconError, currentEngine?.faviconUrl],
  );

  return (
    <div className="adl-tool-panel adl-tool-panel--browser adl-center-browser">
      <div className="adl-tool-context adl-tool-context--files" aria-label={t.toolBrowser}>
        <div className="adl-tool-context__group adl-tool-context__group--grow adl-tool-context__group--files">
          <TooltipSimple content={t.browserBack} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn"
              onClick={handleGoBack}
              disabled={!canGoBack}
              aria-label={t.browserBack}
              aria-disabled={!canGoBack}
            >
              <IconArrowLeft size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.browserForward} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn"
              onClick={handleGoForward}
              disabled={!canGoForward}
              aria-label={t.browserForward}
              aria-disabled={!canGoForward}
            >
              <IconArrowRight size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.browserRefresh} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn"
              onClick={handleReload}
              aria-label={t.browserRefresh}
            >
              <IconRefreshCw size={14} decorative />
            </button>
          </TooltipSimple>
          <label
            ref={addressSearchRef}
            className={`adl-tool-search adl-tool-search--address${addressExpanded ? ' is-expanded' : ''}`}
            onClick={urlState.handleSearchClick}
          >
            <span className="adl-tool-search__icon adl-tool-search__icon--address">
              {engineFavicon ? (
                <img
                  src={engineFavicon}
                  className="adl-toolbar__search-engine-icon"
                  alt=""
                  onError={() => setFaviconError(true)}
                />
              ) : (
                <IconGlobeSearch size={14} decorative />
              )}
            </span>
            <span className="adl-tool-search__preview" aria-hidden={addressExpanded}>
              {searchQueryDisplay || address.trim()}
            </span>
            <input
              ref={addressInputRef}
              type="text"
              value={address}
              onChange={urlState.handleAddressChange}
              onKeyDown={urlState.handleAddressKeyDown}
              onBlur={urlState.handleAddressBlur}
              placeholder={t.browserAddress}
              aria-label={t.browserAddress}
            />
            <CopyButton
              text={activeTab?.url ?? address ?? ''}
              tooltip={t.browserCopyLink as string}
              tooltipCopied={t.copySuccessClipboard as string}
            />
            <TooltipSimple content={isBookmarked ? t.unbookmark : t.bookmark} placement="top">
              <button
                type="button"
                className="adl-copy-btn"
                aria-label={isBookmarked ? t.unbookmark : t.bookmark}
                onClick={(e) => {
                  e.stopPropagation();
                  handleBookmarkClick();
                }}
              >
                {isBookmarked ? (
                  <IconBookmarkStarFilled size={14} decorative />
                ) : (
                  <IconBookmarkStar size={14} decorative />
                )}
              </button>
            </TooltipSimple>
          </label>
        </div>
        <div className="adl-tool-context__group adl-tool-context__group--files-actions">
          <TooltipSimple content={t.browserSearchEngineSettings} placement="top">
            <button
              ref={searchEngineBtnRef}
              type="button"
              className="adl-tool-context__iconbtn"
              onClick={() => setSearchEnginePopoverOpen((v) => !v)}
              aria-label={t.browserSearchEngineSettings}
            >
              <IconSearchEngine size={14} decorative />
            </button>
          </TooltipSimple>
          <BrowserDownloadButton />
          <BrowserMenuDropdown
            menuOpen={browserMenuOpen}
            menuRef={browserMenuRef}
            menuItems={browserMenuItems}
            onToggle={() => setBrowserMenuOpen((v) => !v)}
            onClose={() => setBrowserMenuOpen(false)}
          />
        </div>
        <SearchEnginePopover
          open={searchEnginePopoverOpen}
          onClose={() => setSearchEnginePopoverOpen(false)}
          anchorRef={searchEngineBtnRef as unknown as RefObject<HTMLElement>}
        />
      </div>

      <div
        className="adl-center-browser__content"
        ref={containerRef}
        // 原生 WebView 存在门控：仅当中心确有已入池的原生 WebView 时上报避让矩形
        // （见 webviewAvoidRects 的选择器门控）。无 WebView（浏览器模式 iframe /
        // 空白页 / 未入池）时 tooltip 天然置顶，无需避让。
        data-webview-active={
          isTauri &&
          !centerObscured &&
          !!activeTab?.id &&
          !!activeTab.url &&
          isTabInPool(activeTab.id)
            ? true
            : undefined
        }
      >
        {isEmptyUrl ? (
          <div className="adl-tool-primary__scroll adl-tool-primary__scroll--browser">
            <BrowserLandingPage t={t} onOpenUrl={handleLandingOpenUrl} />
          </div>
        ) : showIframe && activeTab?.url ? (
          <ErrorBoundary
            t={t}
            fallback={
              <ExternalLinkError
                errorKey="browserCannotOpenEmbedded"
                activeTabUrl={activeTab.url}
                t={t}
                variant="active"
              />
            }
          >
            <SafeIframe
              iframeRef={iframeRef}
              src={activeTab.url}
              className="adl-browser-iframe"
              title={activeTab.title}
              onLoad={handleIframeLoad}
              onError={handleIframeError}
              sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
            />
          </ErrorBoundary>
        ) : null}

        {!isEmptyUrl && (
          <BrowserIframeErrorOverlay
            t={t}
            activeTab={activeTab}
            loadingTabId={loadingTabId}
            iframeBlockedDetected={iframeBlockedDetected}
            iframeLoadError={iframeLoadError}
            isEmbedPending={isEmbedPending}
          />
        )}
      </div>

      <BookmarkToFolderDialogs
        open={bookmarkDialogOpen}
        t={t}
        workspaceNodes={bookmarkTreeData.workspaceNodes}
        userFolderNodes={bookmarkTreeData.userFolderNodes}
        onAddToFolder={handleBookmarkAddToFolder}
        onCreateDir={handleBookmarkCreateDir}
        onCancel={handleCloseBookmarkDialog}
        bookmarkName={bookmarkName}
        onBookmarkNameChange={setBookmarkName}
        createDirDialog={createDirDialog}
        setCreateDirDialog={setCreateDirDialog}
      />
    </div>
  );
}
