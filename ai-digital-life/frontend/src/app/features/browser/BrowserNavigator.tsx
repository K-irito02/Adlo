import React from 'react';
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
import { NavigatorResizeHandle } from '@components/NavigatorResizeHandle';
import { BrowserTabTree } from '../browser-tree';
import { CustomScrollArea } from '../file-tree/CustomScrollArea';
import { SearchResultItem } from './BrowserSearchOverlay';
import { resolveFolderWorkspaceId } from './browserPanelHelpers';
import type { BrowserNavigatorMode } from './useBrowserTabs';
import type { BrowserSearchScope } from './useBrowserSearch';
import type { BrowserTabState } from '../../stores/slices/browserSlice';
import type { TabFolderState } from '../../stores/slices/browserFoldersSlice';
import type { BrowserHistoryState } from '../../stores/slices/browserHistorySlice';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import type { ToastType } from '../../components/Toast';
import type { CopyDict } from '../../i18n/types';

export interface BrowserNavigatorProps {
  // i18n
  t: CopyDict;

  // Header state
  navigatorTitle: string;
  openTabCount: number;
  allTreeExpanded: boolean;
  browserShowTabButtons: boolean;
  browserViewMode: 'default' | 'tree' | 'list' | 'all';

  // Navigator mode
  navigatorMode: BrowserNavigatorMode;

  // Resize
  browserNavigatorWidth: number;

  // Header callbacks
  onToggleTabButtons: () => void;
  onSetBrowserViewMode: (mode: 'tree' | 'list' | 'all') => void;
  onDirectListView: () => void;
  onExpandAllTree: () => void;
  onCollapseAllTree: () => void;
  onSetNavigatorMode: React.Dispatch<React.SetStateAction<BrowserNavigatorMode>>;
  onSetBrowserViewModeRaw: (mode: 'default' | 'tree' | 'list' | 'all') => void;

  // Tree data
  visibleWorkspaces: RecentWorkspaceEntry[];
  browserTabs: BrowserTabState[];
  browserTabFolders: TabFolderState[];
  browserHistory: BrowserHistoryState[];
  browserWorkspaceBookmarks: Record<string, string[]>;
  tabTreeExpanded: Record<string, boolean>;
  selectedTreePath: string | null;
  selectedTreePathRef: React.MutableRefObject<string | null>;

  // Tree callbacks
  onSelectTreePath: (path: string | null) => void;
  onToggleTreePath: (path: string) => void;
  onDeleteAllChildTabs: (categoryType: string, nodePath: string) => void;
  onOpenAllInNewTabs: (categoryType: string, nodePath: string) => void;
  onRemoveFromArea: (workspaceId: string) => void;
  onDeleteDirectory: (folderId: string) => void;
  onDeleteHistoryLevel: (level: 'label' | 'year' | 'month' | 'day', nodePath: string) => void;
  onCloseAllTabs: () => void;
  onOpenTab: (url?: string, title?: string, workspaceId?: string) => void;
  onOpenTabFromTree: (url: string, tabId?: string) => void;

  // Dialogs
  onCreateTabDialog: React.Dispatch<
    React.SetStateAction<{ open: boolean; workspaceId?: string; folderId?: string }>
  >;
  onCreateDirDialog: React.Dispatch<
    React.SetStateAction<{ open: boolean; parentPath: string | null }>
  >;
  onRenameFolder: React.Dispatch<
    React.SetStateAction<{ open: boolean; folderId: string; currentName: string }>
  >;

  // Search
  navigatorQuery: string;
  searchScope: string;
  searchResults: Array<{ title: string; url: string; source: string }>;
  navigatorSearchRef: React.RefObject<HTMLDivElement | null>;
  navigatorSearchInputRef: React.RefObject<HTMLInputElement | null>;
  onSetNavigatorQuery: React.Dispatch<React.SetStateAction<string>>;
  onSetSearchScope: React.Dispatch<React.SetStateAction<BrowserSearchScope>>;

  // Resize
  onNavigatorResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;

  // Toast
  showToast: (message: string, type?: ToastType, source?: string) => void;
}

export function BrowserNavigator({
  t,
  navigatorTitle,
  openTabCount,
  allTreeExpanded,
  browserShowTabButtons,
  browserViewMode,
  navigatorMode,
  browserNavigatorWidth,
  onToggleTabButtons,
  onSetBrowserViewMode: handleSetBrowserViewMode,
  onDirectListView: handleDirectListView,
  onExpandAllTree: handleExpandAllTree,
  onCollapseAllTree: handleCollapseAllTree,
  onSetNavigatorMode: setNavigatorMode,
  onSetBrowserViewModeRaw: setBrowserViewMode,
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
  onOpenAllInNewTabs: handleOpenAllInNewTabs,
  onRemoveFromArea: handleRemoveFromArea,
  onDeleteDirectory: handleDeleteDirectory,
  onDeleteHistoryLevel: handleDeleteHistoryLevel,
  onCloseAllTabs: handleCloseAllTabs,
  onOpenTab: browserOpenTab,
  onOpenTabFromTree: handleOpenTabFromTree,
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
          <TooltipSimple
            content={browserShowTabButtons ? t.back : t.browserViewModeDefault}
            placement="top"
          >
            <button
              type="button"
              className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${browserShowTabButtons ? ' is-active' : ''}`}
              onClick={onToggleTabButtons}
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
                let fId: string | undefined;
                if (path.startsWith('workspace:')) {
                  wsId = path.slice('workspace:'.length);
                } else if (path.startsWith('folder:')) {
                  fId = path.slice('folder:'.length);
                  wsId = resolveFolderWorkspaceId(fId, browserTabFolders);
                }
                setCreateTabDialog({ open: true, workspaceId: wsId, folderId: fId });
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
            onCreateTab: (workspaceId?: string, folderId?: string) => {
              setCreateTabDialog({ open: true, workspaceId, folderId });
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
            onOpenTab: handleOpenTabFromTree,
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
