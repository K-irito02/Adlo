import React from 'react';
import {
  IconFolderPlus,
  IconFolder,
  IconPlus,
  IconTrash,
  IconSearch,
  IconList,
  IconLayoutList,
  IconFoldVertical,
  IconUnfoldVertical,
  IconClose,
} from '../../icons';
import { TooltipSimple } from '../../components/Tooltip';
import { useTCopy } from '../../i18n/useTCopy';
import { NavigatorResizeHandle } from '@components/NavigatorResizeHandle';
import { BrowserTabTree } from '../browser-tree';
import { CustomScrollArea } from '../file-tree/CustomScrollArea';
import { SearchResultItem } from './BrowserSearchOverlay';
import { resolveFolderWorkspaceId } from './browserPanelHelpers';
import { BrowserFavicon } from '../../components/BrowserFavicon';
import type { BrowserNavigatorMode } from './useBrowserTabs';
import type { BrowserSearchScope } from './useBrowserSearch';
import type { BrowserTabState } from '../../stores/slices/browserSlice';
import type { TabFolderState } from '../../stores/slices/browserFoldersSlice';
import type { BrowserHistoryState } from '../../stores/slices/browserHistorySlice';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import type { ToastType } from '../../components/Toast';
import type { CopyDict } from '../../i18n/types';

export interface BrowserNavigatorProps {
  t: CopyDict;
  navigatorTitle: string;
  openTabCount: number;
  allTreeExpanded: boolean;
  navigatorMode: BrowserNavigatorMode;
  browserNavigatorWidth: number;

  onExpandAllTree: () => void;
  onCollapseAllTree: () => void;
  onSetNavigatorMode: React.Dispatch<React.SetStateAction<BrowserNavigatorMode>>;

  visibleWorkspaces: RecentWorkspaceEntry[];
  browserTabs: BrowserTabState[];
  browserTabFolders: TabFolderState[];
  browserHistory: BrowserHistoryState[];
  browserWorkspaceBookmarks: Record<string, string[]>;
  tabTreeExpanded: Record<string, boolean>;
  selectedTreePath: string | null;
  selectedTreePathRef: React.MutableRefObject<string | null>;

  onSelectTreePath: (path: string | null) => void;
  onToggleTreePath: (path: string) => void;
  onDeleteAllChildTabs: (categoryType: string, nodePath: string) => void;
  onDeleteOwnChildTabs: (categoryType: string, nodePath: string) => void;
  onOpenAllInNewTabs: (categoryType: string, nodePath: string) => void;
  onRemoveFromArea: (workspaceId: string) => void;
  onDeleteDirectory: (folderId: string) => void;
  onDeleteHistoryLevel: (level: 'label' | 'year' | 'month' | 'day', nodePath: string) => void;
  onCloseAllTabs: () => void;
  onClearTabDirectories: () => void;
  onOpenTab: (url?: string, title?: string, workspaceId?: string) => void;
  onOpenTabFromTree: (url: string, tabId?: string) => void;

  onRefreshTab: (tabId: string, url: string) => void;
  onEditTab: (tabId: string, name: string, url: string) => void;
  onDeleteTab: (tabId: string, url: string) => void;
  onCopyTabLink: (url: string) => void;
  onOpenTabInNewTab: (url: string, title: string) => void;
  onOpenTabInCurrentTab: (tabId: string) => void;

  onCreateTabDialog: React.Dispatch<
    React.SetStateAction<{ open: boolean; workspaceId?: string; folderId?: string }>
  >;
  onCreateDirDialog: React.Dispatch<
    React.SetStateAction<{ open: boolean; parentPath: string | null }>
  >;
  onRenameFolder: React.Dispatch<
    React.SetStateAction<{ open: boolean; folderId: string; currentName: string }>
  >;

  navigatorQuery: string;
  searchScope: string;
  searchResults: Array<{ title: string; url: string; source: string }>;
  navigatorSearchRef: React.RefObject<HTMLDivElement | null>;
  navigatorSearchInputRef: React.RefObject<HTMLInputElement | null>;
  onSetNavigatorQuery: React.Dispatch<React.SetStateAction<string>>;
  onSetSearchScope: React.Dispatch<React.SetStateAction<BrowserSearchScope>>;

  onNavigatorResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;

  showToast: (message: string, type?: ToastType, source?: string) => void;
}

function OpenTabFlatList({
  browserTabs,
  onSelectTab,
  onCloseTab,
}: {
  browserTabs: BrowserTabState[];
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
}) {
  const { t } = useTCopy();

  if (browserTabs.length === 0) {
    return (
      <div className="adl-multitree__empty">
        <p className="adl-empty-hint">{t.noContent}</p>
      </div>
    );
  }

  return (
    <CustomScrollArea
      shellClassName="adl-multitree adl-multitree--browser"
      scrollClassName="adl-multitree-scroll"
      scrollbarClassName="adl-multitree-scrollbar"
      thumbClassName="adl-multitree-scrollbar__thumb"
    >
      <div className="adl-browser-entry__tree adl-browser-entry__tree--flat">
        <ul className="adl-filetree" role="tree">
          {browserTabs.map((tab) => (
            <li
              key={tab.id}
              className="adl-filetree__item adl-filetree__node--file"
              data-path={`tab:${tab.id}`}
              role="treeitem"
            >
              <div className="adl-filetree__row" onClick={() => onSelectTab(tab.id)}>
                <span
                  className="adl-filetree__indent adl-filetree__indent--flat"
                  aria-hidden="true"
                />
                <BrowserFavicon url={tab.url} />
                <button
                  type="button"
                  className="adl-filetree__label"
                  onClick={() => onSelectTab(tab.id)}
                >
                  <span className="adl-filetree__label-content">
                    <span className="adl-filetree__label-text">{tab.title}</span>
                  </span>
                </button>
                <span className="adl-filetree__meta adl-tree-node__meta--inline">
                  <span className="adl-browser-node__actions">
                    <TooltipSimple content={t.browserClose} placement="top">
                      <button
                        type="button"
                        className="adl-icon-btn adl-icon-btn--xs adl-icon-btn--danger-hover"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCloseTab(tab.id);
                        }}
                        aria-label={t.browserClose}
                      >
                        <IconClose size={12} decorative />
                      </button>
                    </TooltipSimple>
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </CustomScrollArea>
  );
}

export function BrowserNavigator({
  t,
  navigatorTitle,
  openTabCount,
  allTreeExpanded,
  navigatorMode,
  browserNavigatorWidth,
  onExpandAllTree: handleExpandAllTree,
  onCollapseAllTree: handleCollapseAllTree,
  onSetNavigatorMode: setNavigatorMode,
  visibleWorkspaces,
  browserTabs,
  browserTabFolders,
  browserHistory,
  browserWorkspaceBookmarks,
  tabTreeExpanded,
  selectedTreePath,
  selectedTreePathRef,
  onSelectTreePath: handleSelectTreePath,
  onToggleTreePath: handleToggleTreePath,
  onDeleteAllChildTabs: handleDeleteAllChildTabs,
  onDeleteOwnChildTabs: handleDeleteOwnChildTabs,
  onOpenAllInNewTabs: handleOpenAllInNewTabs,
  onRemoveFromArea: handleRemoveFromArea,
  onDeleteDirectory: handleDeleteDirectory,
  onDeleteHistoryLevel: handleDeleteHistoryLevel,
  onCloseAllTabs: handleCloseAllTabs,
  onClearTabDirectories: handleClearTabDirectories,
  onOpenTab: browserOpenTab,
  onOpenTabFromTree: handleOpenTabFromTree,
  onRefreshTab: handleRefreshTab,
  onEditTab: handleEditTab,
  onDeleteTab: handleDeleteTab,
  onCopyTabLink: handleCopyTabLink,
  onOpenTabInNewTab: handleOpenTabInNewTab,
  onOpenTabInCurrentTab: handleOpenTabInCurrentTab,
  onCreateTabDialog: setCreateTabDialog,
  onCreateDirDialog: setCreateDirDialog,
  onRenameFolder: setRenameFolderState,
  navigatorQuery,
  searchScope,
  searchResults,
  navigatorSearchRef,
  navigatorSearchInputRef,
  onSetNavigatorQuery: setNavigatorQuery,
  onSetSearchScope: setSearchScope,
  onNavigatorResizeStart: handleNavigatorResizeStart,
  showToast,
}: BrowserNavigatorProps) {
  return (
    <aside className="adl-tool-navigator" aria-label={t.toolBrowser}>
      <div className="adl-tool-navigator__context">
        <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
          <TooltipSimple content={allTreeExpanded ? t.collapseAll : t.expandAll} placement="top">
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
          {/* Mode: 已打开的标签 */}
          <TooltipSimple content={t.browserOpenTabs} placement="top">
            <button
              type="button"
              className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${navigatorMode === 'open' ? ' is-active' : ''}`}
              onClick={() => setNavigatorMode('open')}
              aria-label={t.browserOpenTabs}
              aria-pressed={navigatorMode === 'open'}
            >
              <IconList size={14} decorative />
            </button>
          </TooltipSimple>
        </div>
      </div>
      <div className="adl-tool-navigator__context adl-tool-navigator__context--secondary">
        <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
          {/* Mode: 标签目录 */}
          <TooltipSimple content={t.browserTabDir} placement="top">
            <button
              type="button"
              className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${navigatorMode === 'tabs' ? ' is-active' : ''}`}
              onClick={() => setNavigatorMode('tabs')}
              aria-label={t.browserTabDir}
              aria-pressed={navigatorMode === 'tabs'}
            >
              <IconFolder size={14} decorative />
            </button>
          </TooltipSimple>
          {/* Mode: 文件列表 */}
          <TooltipSimple content={t.browserViewModeList} placement="top">
            <button
              type="button"
              className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${navigatorMode === 'list' ? ' is-active' : ''}`}
              onClick={() => setNavigatorMode('list')}
              aria-label={t.browserViewModeList}
              aria-pressed={navigatorMode === 'list'}
            >
              <IconLayoutList size={14} decorative />
            </button>
          </TooltipSimple>
          {/* Mode: 搜索标签 */}
          <TooltipSimple content={t.browserSearchTabs} placement="top">
            <button
              type="button"
              className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${navigatorMode === 'search' ? ' is-active' : ''}`}
              onClick={() => setNavigatorMode('search')}
              aria-label={t.browserSearchTabs}
              aria-pressed={navigatorMode === 'search'}
            >
              <IconSearch size={14} decorative />
            </button>
          </TooltipSimple>
        </div>
        <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility">
          {/* 新建标签: only in open and tabs modes */}
          <span
            style={{ display: navigatorMode === 'open' || navigatorMode === 'tabs' ? '' : 'none' }}
          >
            <TooltipSimple content={t.browserNewTabBtn} placement="top">
              <button
                type="button"
                className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                onClick={() => {
                  if (navigatorMode === 'tabs') {
                    const path = selectedTreePathRef.current;
                    if (!path || (!path.startsWith('folder:') && !path.startsWith('workspace:'))) {
                      showToast(t.browserSelectDirFirst, 'warning');
                      return;
                    }
                    let wsId: string | undefined;
                    let fId: string | undefined;
                    if (path.startsWith('workspace:')) {
                      wsId = path.slice('workspace:'.length);
                    } else if (path.startsWith('folder:')) {
                      fId = path.slice('folder:'.length);
                      wsId = resolveFolderWorkspaceId(fId, browserTabFolders);
                    }
                    setCreateTabDialog({ open: true, workspaceId: wsId, folderId: fId });
                  } else {
                    browserOpenTab(undefined, t.browserNewTabPage);
                  }
                }}
                aria-label={t.browserNewTabBtn}
              >
                <IconPlus size={14} decorative />
              </button>
            </TooltipSimple>
          </span>
          {/* 新建目录: only in tabs mode */}
          <span style={{ display: navigatorMode === 'tabs' ? '' : 'none' }}>
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
          </span>
          {/* 清空所有已打开标签: only in open mode */}
          <span style={{ display: navigatorMode === 'open' ? '' : 'none' }}>
            <TooltipSimple content={t.browserClearAllOpenTabs} placement="top">
              <button
                type="button"
                className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                onClick={() => handleCloseAllTabs()}
                aria-label={t.browserClearAllOpenTabs}
              >
                <IconTrash size={14} decorative />
              </button>
            </TooltipSimple>
          </span>
          {/* 删除工作区与非工作区全部标签: only in tabs and list modes */}
          <span
            style={{ display: navigatorMode === 'tabs' || navigatorMode === 'list' ? '' : 'none' }}
          >
            <TooltipSimple content={t.browserDeleteAllTabDirs} placement="top">
              <button
                type="button"
                className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                onClick={() => handleClearTabDirectories()}
                aria-label={t.browserDeleteAllTabDirs}
              >
                <IconTrash size={14} decorative />
              </button>
            </TooltipSimple>
          </span>
        </div>
      </div>

      {/* Body */}
      {navigatorMode === 'open' ? (
        <OpenTabFlatList
          browserTabs={browserTabs}
          onSelectTab={(tabId) => {
            const tab = browserTabs.find((t) => t.id === tabId);
            if (tab) {
              handleOpenTabFromTree(tab.url, tab.id);
            }
          }}
          onCloseTab={(tabId) => handleDeleteTab(tabId, '')}
        />
      ) : navigatorMode === 'tabs' ? (
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
          callbacks={{
            onCreateTab: (workspaceId?: string, folderId?: string) => {
              setCreateTabDialog({ open: true, workspaceId, folderId });
            },
            onDeleteAllChildTabs: handleDeleteAllChildTabs,
            onDeleteOwnChildTabs: handleDeleteOwnChildTabs,
            onOpenAllInNewTabs: handleOpenAllInNewTabs,
            onRemoveFromArea: handleRemoveFromArea,
            onDeleteDirectory: handleDeleteDirectory,
            onRenameDirectory: (folderId: string) => {
              const folder = browserTabFolders.find((f) => f.id === folderId);
              setRenameFolderState({ open: true, folderId, currentName: folder?.name ?? '' });
            },
            onDeleteHistory: handleDeleteHistoryLevel,
            onOpenTab: handleOpenTabFromTree,
            onRefreshTab: handleRefreshTab,
            onEditTab: handleEditTab,
            onDeleteTab: handleDeleteTab,
            onCopyTabLink: handleCopyTabLink,
            onOpenTabInNewTab: handleOpenTabInNewTab,
            onOpenTabInCurrentTab: handleOpenTabInCurrentTab,
          }}
          labels={{
            workspaceCategory: t.browserCategoryWorkspace,
            userFolderCategory: t.browserCategoryUserFolder,
            historyCategory: t.browserCategoryHistory,
          }}
        />
      ) : navigatorMode === 'list' ? (
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
          browserViewMode="list"
          callbacks={{
            onCreateTab: (workspaceId?: string, folderId?: string) => {
              setCreateTabDialog({ open: true, workspaceId, folderId });
            },
            onDeleteAllChildTabs: handleDeleteAllChildTabs,
            onDeleteOwnChildTabs: handleDeleteOwnChildTabs,
            onOpenAllInNewTabs: handleOpenAllInNewTabs,
            onRemoveFromArea: handleRemoveFromArea,
            onDeleteDirectory: handleDeleteDirectory,
            onRenameDirectory: (folderId: string) => {
              const folder = browserTabFolders.find((f) => f.id === folderId);
              setRenameFolderState({ open: true, folderId, currentName: folder?.name ?? '' });
            },
            onDeleteHistory: handleDeleteHistoryLevel,
            onOpenTab: handleOpenTabFromTree,
            onRefreshTab: handleRefreshTab,
            onEditTab: handleEditTab,
            onDeleteTab: handleDeleteTab,
            onCopyTabLink: handleCopyTabLink,
            onOpenTabInNewTab: handleOpenTabInNewTab,
            onOpenTabInCurrentTab: handleOpenTabInCurrentTab,
          }}
          labels={{
            workspaceCategory: t.browserCategoryWorkspace,
            userFolderCategory: t.browserCategoryUserFolder,
            historyCategory: t.browserCategoryHistory,
          }}
        />
      ) : navigatorMode === 'search' ? (
        <div className="adl-tool-navigator__content" ref={navigatorSearchRef}>
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
                <span className="adl-tool-navigator__summary-label">{t.browserSearchHistory}</span>
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
  );
}
