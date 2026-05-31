import React, { useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCopy,
  IconFolder,
  IconFolderPlus,
  IconHistory,
  IconLink,
  IconPanelLeftClose,
  IconPlus,
  IconRefreshCw,
  IconSearch,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconMoreVertical,
  IconFiles,
  IconList,
  IconLayoutList,
  IconBack,
  IconGlobe
} from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";
import { useAppStore } from "../../stores/slicedStore";
import { useBrowserPanel } from "./useBrowserPanel";
import { BrowserContextMenu } from "./BrowserContextMenu";
import { BrowserMenuDropdown } from "./BrowserMenuDropdown";
import { MultiWorkspaceBrowser } from "../workspace-browser";
import { CustomScrollArea } from "../file-tree/CustomScrollArea";
import { isTauriShell } from "../../../tauri-bridge";
import type { BrowserPanelProps } from "../../regions/right-panel/types";
import { open as shellOpen } from "@tauri-apps/plugin-shell";

function handleRenameFromContextMenu(
  browserTabs: Array<{ id: string; title: string }>,
  contextMenu: { tabId: string | null },
  handleDoubleClick: (tabId: string, title: string) => void
): () => void {
  return () => {
    if (contextMenu.tabId) {
      const tab = browserTabs.find(t => t.id === contextMenu.tabId);
      if (tab) {
        handleDoubleClick(contextMenu.tabId, tab.title);
      }
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
      onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
    >
      <IconGlobe size={14} decorative className="adl-browser-search-result-item__icon" />
      <div className="adl-browser-search-result-item__content">
        <div className="adl-browser-search-result-item__title" title={item.title}>
          {item.title}
        </div>
        <div className="adl-browser-search-result-item__url" title={item.url}>
          {item.url}
        </div>
      </div>
      {item.source && (
        <div className="adl-browser-search-result-item__source">
          {item.source}
        </div>
      )}
    </div>
  );
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

export function BrowserPanel(props: BrowserPanelProps) {
  const { t } = props;

  const setActiveRightTool = useAppStore((state) => state.setActiveRightTool);
  const recentWorkspaces = useAppStore((state) => state.recentWorkspaces);
  const browserSelectTab = useAppStore((state) => state.browserSelectTab);
  const browserCloseTab = useAppStore((state) => state.browserCloseTab);
  const browserTogglePin = useAppStore((state) => state.browserTogglePin);
  const browserViewMode = useAppStore((state) => state.browserViewMode);
  const browserShowTabButtons = useAppStore((state) => state.browserShowTabButtons);
  const browserHistory = useAppStore((state) => state.browserHistory);
  const setBrowserViewMode = useAppStore((state) => state.setBrowserViewMode);
  const setBrowserShowTabButtons = useAppStore((state) => state.setBrowserShowTabButtons);

  const browserOpenTab = useAppStore((state) => state.browserOpenTab);

  const {
    browserState,
    browserActions,
    dragHandlers,
    menuHandlers,
  } = useBrowserPanel(props);

  const visibleWorkspaces = useMemo(
    () => recentWorkspaces.filter((w) => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available),
    [recentWorkspaces]
  );

  const openTabCount = useMemo(() => {
    return browserState.browserTabs.length;
  }, [browserState.browserTabs]);

  const navigatorTitle = useMemo(() => {
    if (browserShowTabButtons) {
      const modeLabels: Record<string, string> = {
        "tree": "文件树",
        "list": "文件列表",
        "all": "全列表"
      };
      return modeLabels[browserViewMode] || "已打开标签";
    }
    return browserState.navigatorTitle;
  }, [browserShowTabButtons, browserViewMode, browserState.navigatorTitle]);

  const handleToggleTabButtons = useCallback(() => {
    if (browserShowTabButtons) {
      setBrowserShowTabButtons(false);
      setBrowserViewMode("default");
    } else {
      setBrowserShowTabButtons(true);
      setBrowserViewMode("tree");
    }
  }, [browserShowTabButtons, setBrowserShowTabButtons, setBrowserViewMode]);

  const handleSetBrowserViewMode = useCallback((mode: "tree" | "list" | "all") => {
    setBrowserViewMode(mode);
    setBrowserShowTabButtons(true);
  }, [setBrowserViewMode, setBrowserShowTabButtons]);

  return (
    <div className="adl-tool-panel adl-tool-panel--browser">
      <div className="adl-tool-context adl-tool-context--files" aria-label={t.toolBrowser}>
        <div className="adl-tool-context__group adl-tool-context__group--grow adl-tool-context__group--files">
          <TooltipSimple content={browserState.navigatorCollapsed ? t.panelToggleRight : t.panelToggleLeft} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn adl-tool-context__iconbtn--leading"
              onClick={() => browserActions.toggleNavigator("browser")}
              aria-label={browserState.navigatorCollapsed ? t.panelToggleRight : t.panelToggleLeft}
            >
              <IconPanelLeftClose size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.browserBack} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn"
              onClick={() => {
                if (isTauriShell()) {
                  invoke("browser_go_back").catch((err) => console.error("browser_go_back failed:", err));
                } else if (browserState.iframeRef.current) {
                  browserState.iframeHistory.index > 0 &&
                    browserState.iframeHistory.entries[browserState.iframeHistory.index - 1] &&
                    browserActions.navigateBrowser(browserState.iframeHistory.entries[browserState.iframeHistory.index - 1]);
                }
              }}
              aria-label={t.browserBack}
            >
              <IconArrowLeft size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.browserForward} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn"
              onClick={() => {
                if (isTauriShell()) {
                  invoke("browser_go_forward").catch((err) => console.error("browser_go_forward failed:", err));
                } else if (browserState.iframeRef.current) {
                  browserState.iframeHistory.index < browserState.iframeHistory.entries.length - 1 &&
                    browserState.iframeHistory.entries[browserState.iframeHistory.index + 1] &&
                    browserActions.navigateBrowser(browserState.iframeHistory.entries[browserState.iframeHistory.index + 1]);
                }
              }}
              aria-label={t.browserForward}
            >
              <IconArrowRight size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.browserRefresh} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn"
              onClick={() => {
                if (isTauriShell()) {
                  invoke("browser_reload").catch((err) => console.error("browser_reload failed:", err));
                } else if (browserState.iframeRef.current?.contentWindow) {
                  browserState.iframeRef.current.contentWindow.location.reload();
                }
              }}
              aria-label={t.browserRefresh}
            >
              <IconRefreshCw size={14} decorative />
            </button>
          </TooltipSimple>
          <label
            ref={browserState.addressSearchRef}
            className={`adl-tool-search adl-tool-search--address${browserState.addressExpanded ? " is-expanded" : ""}`}
            onClick={() => browserActions.setAddressExpanded(true)}
          >
            <IconLink size={14} decorative className="adl-tool-search__icon adl-tool-search__icon--address" />
            <span className="adl-tool-search__preview" aria-hidden={browserState.addressExpanded}>
              {browserState.address.trim()}
            </span>
            <input
              ref={browserState.addressInputRef}
              type="search"
              value={browserState.address}
              onChange={(event) => browserActions.setAddress(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  browserActions.submitAddress();
                }
              }}
              onBlur={() => browserActions.setAddressExpanded(false)}
              placeholder={t.browserAddress}
              aria-label={t.browserAddress}
            />
            <TooltipSimple content={t.browserCopyLink} placement="top">
              <button
                type="button"
                className="adl-tool-search__copy"
                onClick={(e) => {
                  e.stopPropagation();
                  const url = (browserState.activeTab?.url ?? browserState.address) || "";
                  if (url) {
                    navigator.clipboard?.writeText(url).catch(() => {
                      const textarea = document.createElement('textarea');
                      textarea.value = url;
                      document.body.appendChild(textarea);
                      textarea.select();
                      document.execCommand('copy');
                      document.body.removeChild(textarea);
                    });
                  }
                }}
              >
                <IconCopy size={14} decorative />
              </button>
            </TooltipSimple>
            <TooltipSimple content="新建标签页" placement="top">
              <button
                type="button"
                className="adl-tool-search__copy"
                onClick={(e) => {
                  e.stopPropagation();
                  browserOpenTab();
                }}
              >
                <IconPlus size={14} decorative />
              </button>
            </TooltipSimple>
          </label>
        </div>
        <div className="adl-tool-context__group adl-tool-context__group--files-actions">
          <TooltipSimple content={browserState.isBookmarked ? "取消收藏" : "收藏标签"} placement="top">
            <button 
              type="button" 
              className="adl-tool-context__iconbtn" 
              aria-label={browserState.isBookmarked ? "取消收藏" : "收藏标签"}
              onClick={() => {
                browserActions.handleToggleBookmark();
              }}
            >
              {browserState.isBookmarked ? <IconStarFilled size={14} decorative /> : <IconStar size={14} decorative />}
            </button>
          </TooltipSimple>
          <BrowserMenuDropdown
            menuOpen={browserState.browserMenuOpen}
            menuRef={browserState.browserMenuRef}
            menuItems={browserState.browserMenuItems}
            onToggle={() => browserActions.setBrowserMenuOpen((value) => !value)}
            onClose={() => browserActions.setBrowserMenuOpen(false)}
            t={t}
          />
        </div>
      </div>

      <div
        className={`adl-tool-surface adl-tool-surface--files${browserState.navigatorCollapsed ? " is-navigator-collapsed" : ""}`}
        style={{ "--adl-files-nav-width": `${browserState.browserNavigatorWidth}px` } as React.CSSProperties}
      >
        <aside className="adl-tool-navigator" aria-label={t.toolBrowser}>
          <div className="adl-tool-navigator__context">
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
              <span className="adl-tool-navigator__context-title">{navigatorTitle}</span>
            </div>
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility">
              <span className="adl-tool-navigator__context-count">{openTabCount}</span>
              <TooltipSimple content="已打开标签" placement="top">
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${browserShowTabButtons ? " is-active" : ""}`}
                  onClick={handleToggleTabButtons}
                  aria-label="已打开标签"
                >
                  {browserShowTabButtons ? <IconBack size={14} decorative /> : <IconList size={14} decorative />}
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
                    className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${browserViewMode === "tree" ? " is-active" : ""}`}
                    onClick={() => handleSetBrowserViewMode("tree")}
                    aria-label="文件树"
                    aria-pressed={browserViewMode === "tree" ? "true" : "false"}
                  >
                    <IconFiles size={14} decorative />
                  </button>
                </TooltipSimple>
                <TooltipSimple content="文件列表" placement="top">
                  <button
                    type="button"
                    className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${browserViewMode === "list" ? " is-active" : ""}`}
                    onClick={() => handleSetBrowserViewMode("list")}
                    aria-label="文件列表"
                    aria-pressed={browserViewMode === "list" ? "true" : "false"}
                  >
                    <IconList size={14} decorative />
                  </button>
                </TooltipSimple>
                <TooltipSimple content="全列表" placement="top">
                  <button
                    type="button"
                    className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${browserViewMode === "all" ? " is-active" : ""}`}
                    onClick={() => handleSetBrowserViewMode("all")}
                    aria-label="全列表"
                    aria-pressed={browserViewMode === "all" ? "true" : "false"}
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
                    className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${browserState.navigatorMode === "tabs" ? " is-active" : ""}`}
                    onClick={() => browserActions.setNavigatorMode("tabs")}
                    aria-label="标签目录"
                    aria-pressed={browserState.navigatorMode === "tabs" ? "true" : "false"}
                  >
                    <IconFolder size={14} decorative />
                  </button>
                </TooltipSimple>
                <TooltipSimple content={t.browserSearchTabs} placement="top">
                  <button
                    type="button"
                    className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${browserState.navigatorMode === "search" ? " is-active" : ""}`}
                    onClick={() => browserActions.setNavigatorMode("search")}
                    aria-label={t.browserSearchTabs}
                    aria-pressed={browserState.navigatorMode === "search" ? "true" : "false"}
                  >
                    <IconSearch size={14} decorative />
                  </button>
                </TooltipSimple>
              </div>
            )}
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility">

              <TooltipSimple content={browserShowTabButtons ? "清空所有已打开标签" : "删除全部目录标签"} placement="top">
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={() => browserActions.handleCloseAllTabs()}
                  aria-label={browserShowTabButtons ? "清空所有已打开标签" : "删除全部目录标签"}
                >
                  <IconTrash size={14} decorative />
                </button>
              </TooltipSimple>
            </div>
          </div>
          {browserState.navigatorMode === "tabs" ? (
            <MultiWorkspaceBrowser
              workspaces={visibleWorkspaces}
              browserTabs={browserState.browserTabs}
              activeTabId={browserState.browserActiveTabId}
              t={t}
            />
          ) : browserState.navigatorMode === "search" ? (
            <div className="adl-tool-navigator__content">
              <div className="adl-tool-navigator__context adl-tool-navigator__context--search adl-tool-navigator__context--search-stack">
                <div className="adl-tool-search-scope" role="tablist" aria-label={t.browserSearchTabs}>
                  <button
                    type="button"
                    className={`adl-tool-search-scope__btn${browserState.searchScope === "bookmarks" ? " is-active" : ""}`}
                    onClick={() => browserActions.setSearchScope("bookmarks")}
                  >
                    {t.browserSearchBookmarks}
                  </button>
                  <button
                    type="button"
                    className={`adl-tool-search-scope__btn${browserState.searchScope === "history" ? " is-active" : ""}`}
                    onClick={() => browserActions.setSearchScope("history")}
                  >
                    {t.browserSearchHistory}
                  </button>
                  <button
                    type="button"
                    className={`adl-tool-search-scope__btn${browserState.searchScope === "all" ? " is-active" : ""}`}
                    onClick={() => browserActions.setSearchScope("all")}
                  >
                    {t.browserSearchAll}
                  </button>
                </div>
                <label className="adl-tool-search adl-tool-search--compact adl-tool-search--navigator">
                  <IconSearch size={12} decorative />
                  <input
                    ref={browserState.navigatorSearchInputRef}
                    type="search"
                    value={browserState.navigatorQuery}
                    onChange={(event) => browserActions.setNavigatorQuery(event.target.value)}
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
                {browserState.searchResults.length > 0 ? (
                  browserState.searchResults.map((item, index) => (
                    <SearchResultItem
                      key={`${item.url}-${index}`}
                      item={item}
                      onClick={() => browserOpenTab(item.url, item.title)}
                    />
                  ))
                ) : browserState.navigatorQuery.trim() ? (
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
            onPointerDown={browserActions.handleNavigatorResizeStart}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize browser navigator"
            aria-valuemin={180}
            aria-valuemax={300}
            aria-valuenow={browserState.browserNavigatorWidth}
          />
        </aside>

        <div className="adl-tool-primary adl-tool-primary--browser" ref={browserState.primaryRef}>
          <div className="adl-tool-primary__scroll adl-tool-primary__scroll--browser" />
          {browserState.hasActiveTab && browserState.activeTab?.url !== "about:blank" ? (
            <>
              {!isTauriShell() && browserState.activeTab && (
                <iframe
                  ref={browserState.iframeRef}
                  src={browserState.activeTab.url}
                  className="adl-browser-iframe"
                  title={browserState.activeTab.title}
                  onLoad={browserActions.handleIframeLoad}
                  onError={browserActions.handleIframeError}
                />
              )}

              {!isTauriShell() && browserState.iframeLoadError && (
                <div className="adl-browser-error-container">
                  <p className="adl-browser-error-text">
                    该网站无法在嵌入式视图中打开，这通常是由于网站的安全策略导致的。
                  </p>
                </div>
              )}

              <button
                type="button"
                className={`adl-browser-external-btn ${browserState.iframeLoadError ? 'adl-browser-external-btn--prominent' : ''}`}
                title={t.browserOpenExternal}
                onClick={() => {
                  const url = browserState.activeTab?.url ?? "about:blank";
                  if (isTauriShell()) {
                    shellOpen(url).catch(err => console.error("Failed to open external browser:", err));
                  } else if ((window as any).trae?.openExternal) {
                    (window as any).trae.openExternal(url);
                  } else {
                    window.open(url, "_blank", "noopener,noreferrer");
                  }
                }}
              >
                {t.browserOpenExternal}
              </button>
            </>
          ) : null}
        </div>
      </div>

      <BrowserContextMenu
        contextMenu={browserState.contextMenu}
        onTogglePin={browserActions.handleTogglePin}
        onRename={handleRenameFromContextMenu(browserState.browserTabs, browserState.contextMenu, browserActions.handleDoubleClick)}
        onDelete={handleDeleteFromContextMenu(browserState.contextMenu, browserActions.handleCloseTab)}
        onCopyUrl={browserActions.handleCopyUrl}
        onOpenInNewTab={browserActions.handleOpenInNewTab}
        onOpenInCurrentTab={browserActions.handleOpenInCurrentTab}
        onEdit={handleRenameFromContextMenu(browserState.browserTabs, browserState.contextMenu, browserActions.handleDoubleClick)}
        onCut={() => {}}
        t={t}
      />
    </div>
  );
}
