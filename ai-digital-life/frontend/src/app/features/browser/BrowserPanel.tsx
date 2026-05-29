import React, { useCallback, useMemo, useState } from "react";
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
  IconFoldVertical,
  IconUnfoldVertical,
  IconTrash,
  IconMoreVertical,
  IconFiles,
  IconList,
  IconLayoutList,
  IconBack
} from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";
import { useAppStore } from "../../stores/slicedStore";
import { useBrowserPanel } from "./useBrowserPanel";
import { BrowserContextMenu } from "./BrowserContextMenu";
import { BrowserMenuDropdown } from "./BrowserMenuDropdown";
import { MultiWorkspaceBrowser } from "../workspace-browser";
import { CreateTabFolderDialog } from "./CreateTabFolderDialog";
import { BookmarkTabDialog } from "./BookmarkTabDialog";
import { FlatTabList } from "./FlatTabList";
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

declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}

export function BrowserPanel(props: BrowserPanelProps) {
  const { t } = props;

  const setActiveRightTool = useAppStore((state) => state.setActiveRightTool);
  const recentWorkspaces = useAppStore((state) => state.recentWorkspaces);
  const browserWorkspaceExpanded = useAppStore((state) => state.browserWorkspaceExpanded);
  const setBrowserWorkspaceExpanded = useAppStore((state) => state.setBrowserWorkspaceExpanded);
  const browserSelectTab = useAppStore((state) => state.browserSelectTab);
  const browserCloseTab = useAppStore((state) => state.browserCloseTab);
  const browserTogglePin = useAppStore((state) => state.browserTogglePin);
  const hideWorkspaceFromRightPanels = useAppStore((state) => state.hideWorkspaceFromRightPanels);
  const browserTabFolders = useAppStore((state) => state.browserTabFolders);
  const browserCreateTabFolder = useAppStore((state) => state.browserCreateTabFolder);
  const browserUpdateTabFolder = useAppStore((state) => state.browserUpdateTabFolder);
  const browserDeleteTabFolder = useAppStore((state) => state.browserDeleteTabFolder);
  const browserViewMode = useAppStore((state) => state.browserViewMode);
  const browserShowTabButtons = useAppStore((state) => state.browserShowTabButtons);
  const browserHistory = useAppStore((state) => state.browserHistory);
  const setBrowserViewMode = useAppStore((state) => state.setBrowserViewMode);
  const setBrowserShowTabButtons = useAppStore((state) => state.setBrowserShowTabButtons);

  const browserOpenTab = useAppStore((state) => state.browserOpenTab);
  const browserBookmarkTab = useAppStore((state) => state.browserBookmarkTab);

  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  const [bookmarkDialogOpen, setBookmarkDialogOpen] = useState(false);

  const {
    browserState,
    browserActions,
    dragHandlers,
    menuHandlers,
  } = useBrowserPanel(props);

  const INDEPENDENT_WORKSPACE_ID = "__independent__";

  const visibleWorkspaces = useMemo(
    () => recentWorkspaces.filter((w) => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available),
    [recentWorkspaces]
  );

  const allBrowserExpanded = useMemo(() => {
    const allWorkspaceExpanded = visibleWorkspaces.length > 0 && visibleWorkspaces.every((w) => browserWorkspaceExpanded[w.id]);
    const allFolderExpanded = browserTabFolders.length > 0 && browserTabFolders.every((f) => browserWorkspaceExpanded[f.id]);
    return (visibleWorkspaces.length === 0 || allWorkspaceExpanded) && (browserTabFolders.length === 0 || allFolderExpanded);
  }, [visibleWorkspaces, browserTabFolders, browserWorkspaceExpanded]);

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

  const handleExpandAllBrowser = useCallback(() => {
    const expanded: Record<string, boolean> = {};
    for (const ws of visibleWorkspaces) {
      expanded[ws.id] = true;
    }
    for (const folder of browserTabFolders) {
      expanded[folder.id] = true;
    }
    setBrowserWorkspaceExpanded(expanded);
  }, [visibleWorkspaces, browserTabFolders, setBrowserWorkspaceExpanded]);

  const handleCollapseAllBrowser = useCallback(() => {
    const expanded: Record<string, boolean> = {};
    setBrowserWorkspaceExpanded(expanded);
  }, [setBrowserWorkspaceExpanded]);

  const handleRefreshAllBrowser = useCallback(() => {
    const newExpanded: Record<string, boolean> = {};
    for (const ws of visibleWorkspaces) {
      newExpanded[ws.id] = true;
    }
    setBrowserWorkspaceExpanded(newExpanded);
  }, [visibleWorkspaces, setBrowserWorkspaceExpanded]);

  const toggleBrowserWorkspaceExpanded = useCallback((id: string) => {
    setBrowserWorkspaceExpanded({
      ...browserWorkspaceExpanded,
      [id]: !browserWorkspaceExpanded[id]
    });
  }, [browserWorkspaceExpanded, setBrowserWorkspaceExpanded]);

  const handleCreateTabFolder = useCallback((name?: string) => {
    browserCreateTabFolder(name);
    setCreateFolderDialogOpen(false);
  }, [browserCreateTabFolder]);

  const handleBookmarkTab = useCallback(async (folderId?: string, newFolderName?: string) => {
    if (browserState.browserActiveTabId) {
      browserBookmarkTab(browserState.browserActiveTabId, folderId, newFolderName);
    }
    setBookmarkDialogOpen(false);
  }, [browserState.browserActiveTabId, browserBookmarkTab]);

  const activeTab = useMemo(() => {
    return browserState.browserTabs.find(tab => tab.id === browserState.browserActiveTabId) || null;
  }, [browserState.browserTabs, browserState.browserActiveTabId]);

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

  const handleHideBrowserWorkspace = useCallback((workspaceId: string) => {
    const ws = recentWorkspaces.find(r => r.id === workspaceId);
    if (ws) hideWorkspaceFromRightPanels(workspaceId);
  }, [recentWorkspaces, hideWorkspaceFromRightPanels]);

  const isTauriShell = typeof window !== "undefined" && window.__TAURI__ !== undefined;

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
                if (isTauriShell) {
                  import("@tauri-apps/api/core").then(({ invoke }) => {
                    invoke("browser_go_back").catch((err) => console.error("browser_go_back failed:", err));
                  }).catch(() => { /* ignore */ });
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
                if (isTauriShell) {
                  import("@tauri-apps/api/core").then(({ invoke }) => {
                    invoke("browser_go_forward").catch((err) => console.error("browser_go_forward failed:", err));
                  }).catch(() => { /* ignore */ });
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
                if (isTauriShell) {
                  import("@tauri-apps/api/core").then(({ invoke }) => {
                    invoke("browser_reload").catch((err) => console.error("browser_reload failed:", err));
                  }).catch(() => { /* ignore */ });
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
                  const url = (browserState.activeTab?.url ?? browserState.address) || "about:blank";
                  navigator.clipboard?.writeText(url).catch(() => {
                    const textarea = document.createElement('textarea');
                    textarea.value = url;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                  });
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
          <TooltipSimple content="收藏标签" placement="top">
            <button 
              type="button" 
              className="adl-tool-context__iconbtn" 
              aria-label="收藏标签"
              onClick={() => setBookmarkDialogOpen(true)}
              disabled={!browserState.browserActiveTabId}
            >
              <IconStar size={14} decorative />
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
              <TooltipSimple content={allBrowserExpanded ? "折叠全部" : "展开全部"} placement="top">
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={allBrowserExpanded ? handleCollapseAllBrowser : handleExpandAllBrowser}
                  aria-label={allBrowserExpanded ? "折叠全部" : "展开全部"}
                >
                  {allBrowserExpanded ? <IconFoldVertical size={14} decorative /> : <IconUnfoldVertical size={14} decorative />}
                </button>
              </TooltipSimple>
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
              {!browserShowTabButtons && (
                <TooltipSimple content="新建标签工作区" placement="top">
                  <button
                    type="button"
                    className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                    aria-label="新建标签工作区"
                    onClick={() => setCreateFolderDialogOpen(true)}
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
            browserViewMode !== "default" ? (
              <FlatTabList
                browserTabs={browserState.browserTabs}
                workspaces={visibleWorkspaces}
                tabFolders={browserTabFolders}
                activeTabId={browserState.browserActiveTabId}
                viewMode={browserViewMode}
                onSelectTab={browserSelectTab}
                onCloseTab={browserCloseTab}
                onOpenInNewTab={(tab) => browserOpenTab(tab.url, tab.title)}
                onDeleteAllTabs={browserActions.handleCloseAllTabs}
                t={t}
              />
            ) : (
              <MultiWorkspaceBrowser
                workspaces={visibleWorkspaces}
                tabFolders={browserTabFolders}
                browserHistory={browserHistory}
                expandedStates={browserWorkspaceExpanded}
                browserTabs={browserState.browserTabs}
                activeTabId={browserState.browserActiveTabId}
                onToggleExpand={toggleBrowserWorkspaceExpanded}
                onCreateTab={(wsId) => browserActions.handleCreateTab(undefined, undefined, wsId)}
                onSelectTab={browserSelectTab}
                onCloseTab={browserCloseTab}
                onTogglePin={browserTogglePin}
                onHideFromRightPanels={handleHideBrowserWorkspace}
                onRefreshTree={handleRefreshAllBrowser}
                onCloseAllTabs={browserActions.handleCloseAllTabs}
                onDeleteTabFolder={browserDeleteTabFolder}
                onRenameTabFolder={(folderId, newName) => browserUpdateTabFolder(folderId, { name: newName })}
                onOpenHistoryItem={(url, title) => browserOpenTab(url, title)}
                t={t}
                editingTabId={browserState.editingTabId}
                editValue={browserState.editValue}
                editInputRef={browserState.editInputRef}
                isDragging={browserState.isDragging}
                dragOverTabId={browserState.dragOverTabId}
                onDragStart={dragHandlers.handleDragStart}
                onDragEnd={dragHandlers.handleDragEnd}
                onDragOver={dragHandlers.handleDragOver}
                onDrop={dragHandlers.handleDrop}
                onTabContextMenu={menuHandlers.handleContextMenu}
                onTabDoubleClick={browserActions.handleDoubleClick}
                onEditChange={browserActions.setEditValue}
                onEditSubmit={browserActions.handleEditSubmit}
                onEditKeyDown={browserActions.handleEditKeyDown}
              />
            )
          ) : browserState.navigatorMode === "search" ? (
            <div ref={browserState.navigatorSearchRef} className="adl-tool-navigator__context adl-tool-navigator__context--search adl-tool-navigator__context--search-stack">
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
              {!isTauriShell && browserState.activeTab && (
                <iframe
                  ref={browserState.iframeRef}
                  src={browserState.activeTab.url}
                  className="adl-browser-iframe"
                  title={browserState.activeTab.title}
                  onLoad={() => {}}
                  onError={() => {}}
                />
              )}

              {!isTauriShell && browserState.iframeLoadError && (
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
                  if (isTauriShell) {
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
      <CreateTabFolderDialog
        open={createFolderDialogOpen}
        t={t}
        onCreate={handleCreateTabFolder}
        onCancel={() => setCreateFolderDialogOpen(false)}
      />
      <BookmarkTabDialog
        open={bookmarkDialogOpen}
        t={t}
        tab={activeTab}
        folders={browserTabFolders}
        onBookmark={handleBookmarkTab}
        onCancel={() => setBookmarkDialogOpen(false)}
      />
    </div>
  );
}
