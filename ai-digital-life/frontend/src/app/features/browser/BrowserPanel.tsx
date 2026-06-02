import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  IconReturn,
  IconGlobe,
  IconFoldVertical,
  IconUnfoldVertical,
} from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";
import { RenameDialog } from "../../components/RenameDialog";
import { useAppStore } from "../../stores/slicedStore";
import { useBrowserPanel } from "./useBrowserPanel";
import { BrowserContextMenu } from "./BrowserContextMenu";
import { BrowserMenuDropdown } from "./BrowserMenuDropdown";
import { BrowserTabTree } from "../browser-tree";
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
          <div className="adl-browser-search-result-item__title">
            {item.title}
          </div>
          <div className="adl-browser-search-result-item__url">
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
  const browserTabFolders = useAppStore((state) => state.browserTabFolders);

  const [renameFolderState, setRenameFolderState] = useState<{ open: boolean; folderId: string; currentName: string }>({
    open: false,
    folderId: "",
    currentName: "",
  });

  const [selectedTreePath, setSelectedTreePath] = useState<string | null>(null);
  const selectedTreePathRef = useRef<string | null>(null);

  const handleSelectTreePath = useCallback((path: string | null) => {
    selectedTreePathRef.current = path;
    setSelectedTreePath(path);
  }, []);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const clickedEntry = target.closest(".adl-browser-entry");
      const clickedFileTreeRow = target.closest(".adl-filetree__row");
      
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
    document.addEventListener("click", handleGlobalClick);
    return () => document.removeEventListener("click", handleGlobalClick);
  }, [handleSelectTreePath]);

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

  const openTabCount = browserState.navigatorCount;

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
              <TooltipSimple content={browserState.allTreeExpanded ? "全部折叠" : "全部展开"} placement="top">
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={browserState.allTreeExpanded ? browserActions.handleCollapseAllTree : browserActions.handleExpandAllTree}
                  aria-label={browserState.allTreeExpanded ? "全部折叠" : "全部展开"}
                >
                  {browserState.allTreeExpanded ? <IconFoldVertical size={14} decorative /> : <IconUnfoldVertical size={14} decorative />}
                </button>
              </TooltipSimple>
              <span className="adl-tool-navigator__context-title">{navigatorTitle}</span>
            </div>
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility">
              <span className="adl-tool-navigator__context-count">{openTabCount}</span>
              <TooltipSimple content={browserShowTabButtons ? "后退" : "已打开标签"} placement="top">
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${browserShowTabButtons ? " is-active" : ""}`}
                  onClick={handleToggleTabButtons}
                  aria-label={browserShowTabButtons ? "后退" : "已打开标签"}
                >
                  {browserShowTabButtons ? <IconReturn size={14} decorative /> : <IconList size={14} decorative />}
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
              <TooltipSimple content="新建标签" placement="top">
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={() => browserActions.handleCreateTabInTree()}
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
                      if (path && path.startsWith("folder:")) {
                        const folderId = path.slice("folder:".length);
                        useAppStore.getState().browserCreateTabFolder(undefined, folderId, 'folder');
                      } else if (path && path.startsWith("workspace:")) {
                        const wsId = path.slice("workspace:".length);
                        useAppStore.getState().browserCreateTabFolder(undefined, wsId, 'workspace');
                      } else {
                        useAppStore.getState().browserCreateTabFolder(undefined, undefined, undefined);
                      }
                    }}
                    aria-label="新建目录"
                  >
                    <IconFolderPlus size={14} decorative />
                  </button>
                </TooltipSimple>
              )}
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
            <BrowserTabTree
              workspaces={visibleWorkspaces}
              browserTabs={browserState.browserTabs}
              browserTabFolders={browserState.browserTabFolders}
              browserHistory={browserHistory}
              tabTreeExpanded={browserState.tabTreeExpanded}
              selectedTreePath={selectedTreePath}
              onSelectTreePath={handleSelectTreePath}
              onTogglePath={browserActions.handleToggleTreePath}
              callbacks={{
                onCreateTab: browserActions.handleCreateTabInTree,
                onDeleteAllChildTabs: browserActions.handleDeleteAllChildTabs,
                onOpenAllInNewTabs: browserActions.handleOpenAllInNewTabs,
                onRemoveFromArea: browserActions.handleRemoveFromArea,
                onDeleteDirectory: browserActions.handleDeleteDirectory,
                onRenameDirectory: (folderId: string) => {
                  const folder = browserTabFolders.find((f) => f.id === folderId);
                  setRenameFolderState({ open: true, folderId, currentName: folder?.name ?? "" });
                },
                onDeleteHistory: browserActions.handleDeleteHistoryLevel,
                onOpenTab: (url: string, tabId?: string) => {
                  if (tabId) {
                    const tab = browserState.browserTabs.find((t) => t.id === tabId);
                    if (tab) {
                      browserSelectTab(tabId);
                      return;
                    }
                  }
                  browserOpenTab(url, undefined, undefined);
                },
              }}
              labels={{
                workspaceCategory: "工作区目录",
                userFolderCategory: "非工作区目录",
                historyCategory: "历史目录",
              }}
            />
          ) : browserState.navigatorMode === "search" ? (
            <div className="adl-tool-navigator__content">
              <div className="adl-tool-navigator__context adl-tool-navigator__context--search">
                <div className="adl-tool-navigator__summary-stats" role="tablist" aria-label={t.browserSearchTabs}>
                  <button
                    type="button"
                    className={`adl-tool-navigator__summary-stat${browserState.searchScope === "bookmarks" ? " is-active" : ""}`}
                    onClick={() => browserActions.setSearchScope("bookmarks")}
                    aria-pressed={browserState.searchScope === "bookmarks"}
                    aria-label={t.browserSearchBookmarks}
                  >
                    <span className="adl-tool-navigator__summary-label">{t.browserSearchBookmarks}</span>
                  </button>
                  <button
                    type="button"
                    className={`adl-tool-navigator__summary-stat${browserState.searchScope === "history" ? " is-active" : ""}`}
                    onClick={() => browserActions.setSearchScope("history")}
                    aria-pressed={browserState.searchScope === "history"}
                    aria-label={t.browserSearchHistory}
                  >
                    <span className="adl-tool-navigator__summary-label">{t.browserSearchHistory}</span>
                  </button>
                  <button
                    type="button"
                    className={`adl-tool-navigator__summary-stat${browserState.searchScope === "all" ? " is-active" : ""}`}
                    onClick={() => browserActions.setSearchScope("all")}
                    aria-pressed={browserState.searchScope === "all"}
                    aria-label={t.browserSearchAll}
                  >
                    <span className="adl-tool-navigator__summary-label">{t.browserSearchAll}</span>
                  </button>
                </div>
                <label className="adl-tool-search adl-tool-search--navigator">
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
    </div>
  );
}
