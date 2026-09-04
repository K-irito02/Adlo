import {
  IconFolderPlus,
  IconFolder,
  IconDelete,
  IconSearch,
  IconList,
  IconLayoutList,
  IconFoldVertical,
  IconUnfoldVertical,
} from '@icons';
import { useState } from 'react';
import { TooltipSimple } from '@components/Tooltip';
import { NavigatorResizeHandle } from '@components/NavigatorResizeHandle';
import { useNavigatorResize } from '@hooks/useNavigatorResize';
import { resolveFolderWorkspaceId } from './browserPanelHelpers';
import { BrowserNavUtilityButtons } from './BrowserNavUtilityButtons';
import { BrowserNavOpenMode } from './BrowserNavOpenMode';
import { BrowserNavTabsMode } from './BrowserNavTabsMode';
import { BrowserNavListMode } from './BrowserNavListMode';
import { BrowserNavSearchMode } from './BrowserNavSearchMode';
import { useBrowserPanelState } from './BrowserPanelStateContext';
import { useBrowserPanelActions } from './BrowserPanelActionsContext';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import type { RecentWorkspaceEntry } from '@shared/ipc';

export function BrowserNavigator() {
  const [deleteBookmarksConfirmOpen, setDeleteBookmarksConfirmOpen] = useState(false);
  const {
    t,
    navigatorTitle,
    openTabCount,
    allTreeExpanded,
    navigatorMode,
    browserNavigatorWidth,
    activeTab,
    evictedTabIds,
    navigatorQuery,
    searchScope,
    searchResults,
    navigatorSearchRef,
    navigatorSearchInputRef,
    selectedTreePath,
    selectedTreePathRef,
    visibleWorkspaces,
    browserTabs,
    browserTabFolders,
    tabTreeExpanded,
  } = useBrowserPanelState();

  const activeTabId = activeTab?.id ?? '';

  const {
    handleExpandAllTree,
    handleCollapseAllTree,
    setNavigatorMode,
    handleSelectTreePath,
    handleToggleTreePath,
    handleDeleteAllChildTabs,
    handleDeleteOwnChildTabs,
    handleOpenAllInNewTabs,
    handleRemoveFromArea,
    handleDeleteDirectory,
    handleDeleteHistoryLevel,
    handleCloseAllTabs,
    handleClearTabDirectories,
    handleOpenTabFromTree,
    handleAlwaysNewTab,
    handleRefreshTab,
    handleEditTab,
    handleDeleteTab,
    handleCopyTabLink,
    handleOpenTabInNewTab,
    handleOpenTabInCurrentTab,
    onBookmarkTab,
    onRemoveBookmarkTab,
    handleCloseTab,
    handleSetCreateTabDialog: setCreateTabDialog,
    setCreateDirDialog,
    setRenameFolderState,
    setNavigatorQuery,
    setSearchScope,
    showToast,
  } = useBrowserPanelActions();

  const {
    browserBookmarks,
    browserBookmarkTabIdUrlMap,
    browserHistory,
    browserWorkspaceBookmarks,
    setBrowserNavigatorWidth,
    browserSelectTab,
  } = useAppStore(
    useShallow((state) => ({
      browserBookmarks: state.browserBookmarks,
      browserBookmarkTabIdUrlMap: state.browserBookmarkTabIdUrlMap,
      browserHistory: state.browserHistory,
      browserWorkspaceBookmarks: state.browserWorkspaceBookmarks,
      setBrowserNavigatorWidth: state.setBrowserNavigatorWidth,
      browserSelectTab: state.browserSelectTab,
    })),
  );

  const { handlePointerDown: handleNavigatorResizeStart } = useNavigatorResize({
    onWidthCommit: setBrowserNavigatorWidth,
    minWidth: 180,
    maxWidth: 300,
  });

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
          <BrowserNavUtilityButtons
            navigatorMode={navigatorMode}
            newBookmarkLabel={t.browserNewBookmark}
            alwaysNewTabLabel={t.browserNewTabAlways}
            clearOpenTabsLabel={t.browserClearAllOpenTabs}
            onAlwaysNewTab={() => {
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
                // open 模式：始终新建标签页，不受 browserNavigateInPlace 影响
                handleAlwaysNewTab(t.browserNewTabPage);
              }
            }}
            onClearOpenTabs={() => handleCloseAllTabs()}
          />
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
          <span
            style={{ display: navigatorMode === 'tabs' || navigatorMode === 'list' ? '' : 'none' }}
          >
            <button
              type="button"
              className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
              onClick={() => setDeleteBookmarksConfirmOpen(true)}
              aria-label={t.browserDeleteAllBookmarks}
              title={t.browserDeleteAllBookmarks}
            >
              <IconDelete size={14} decorative />
            </button>
          </span>
        </div>
      </div>

      {navigatorMode === 'open' ? (
        <BrowserNavOpenMode
          browserTabs={browserTabs}
          activeTabId={activeTabId}
          evictedTabIds={evictedTabIds}
          onSelectTab={(tabId) => {
            browserSelectTab(tabId);
          }}
          onCloseTab={(tabId) => handleCloseTab(tabId)}
        />
      ) : navigatorMode === 'tabs' ? (
        <BrowserNavTabsMode
          visibleWorkspaces={visibleWorkspaces as RecentWorkspaceEntry[]}
          browserTabs={browserTabs}
          browserTabFolders={browserTabFolders}
          browserHistory={browserHistory}
          browserWorkspaceBookmarks={browserWorkspaceBookmarks}
          browserBookmarks={browserBookmarks}
          browserBookmarkTabIdUrlMap={browserBookmarkTabIdUrlMap}
          tabTreeExpanded={tabTreeExpanded}
          selectedTreePath={selectedTreePath}
          onSelectTreePath={handleSelectTreePath}
          onTogglePath={handleToggleTreePath}
          onCreateTab={(workspaceId?: string, folderId?: string) => {
            setCreateTabDialog({ open: true, workspaceId, folderId });
          }}
          onDeleteAllChildTabs={handleDeleteAllChildTabs}
          onDeleteOwnChildTabs={handleDeleteOwnChildTabs}
          onOpenAllInNewTabs={handleOpenAllInNewTabs}
          onRemoveFromArea={handleRemoveFromArea}
          onDeleteDirectory={handleDeleteDirectory}
          onRenameDirectory={(folderId: string) => {
            const folder = browserTabFolders.find((f) => f.id === folderId);
            setRenameFolderState({ open: true, folderId, currentName: folder?.name ?? '' });
          }}
          onDeleteHistory={handleDeleteHistoryLevel}
          onOpenTab={handleOpenTabFromTree}
          onRefreshTab={handleRefreshTab}
          onEditTab={handleEditTab}
          onDeleteTab={handleDeleteTab}
          onCopyTabLink={handleCopyTabLink}
          onOpenTabInNewTab={handleOpenTabInNewTab}
          onOpenTabInCurrentTab={handleOpenTabInCurrentTab}
          onBookmarkTab={onBookmarkTab}
          onRemoveBookmarkTab={onRemoveBookmarkTab}
          labels={{
            workspaceCategory: t.browserCategoryWorkspace,
            userFolderCategory: t.browserCategoryUserFolder,
            historyCategory: t.browserCategoryHistory,
          }}
        />
      ) : navigatorMode === 'list' ? (
        <BrowserNavListMode
          visibleWorkspaces={visibleWorkspaces as RecentWorkspaceEntry[]}
          browserTabs={browserTabs}
          browserTabFolders={browserTabFolders}
          browserHistory={browserHistory}
          browserWorkspaceBookmarks={browserWorkspaceBookmarks}
          browserBookmarks={browserBookmarks}
          browserBookmarkTabIdUrlMap={browserBookmarkTabIdUrlMap}
          tabTreeExpanded={tabTreeExpanded}
          selectedTreePath={selectedTreePath}
          onSelectTreePath={handleSelectTreePath}
          onTogglePath={handleToggleTreePath}
          onCreateTab={(workspaceId?: string, folderId?: string) => {
            setCreateTabDialog({ open: true, workspaceId, folderId });
          }}
          onDeleteAllChildTabs={handleDeleteAllChildTabs}
          onDeleteOwnChildTabs={handleDeleteOwnChildTabs}
          onOpenAllInNewTabs={handleOpenAllInNewTabs}
          onRemoveFromArea={handleRemoveFromArea}
          onDeleteDirectory={handleDeleteDirectory}
          onRenameDirectory={(folderId: string) => {
            const folder = browserTabFolders.find((f) => f.id === folderId);
            setRenameFolderState({ open: true, folderId, currentName: folder?.name ?? '' });
          }}
          onDeleteHistory={handleDeleteHistoryLevel}
          onOpenTab={handleOpenTabFromTree}
          onRefreshTab={handleRefreshTab}
          onEditTab={handleEditTab}
          onDeleteTab={handleDeleteTab}
          onCopyTabLink={handleCopyTabLink}
          onOpenTabInNewTab={handleOpenTabInNewTab}
          onOpenTabInCurrentTab={handleOpenTabInCurrentTab}
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
          {searchResults.length > 0 ? (
            <BrowserNavSearchMode
              searchResults={searchResults}
              onSelectResult={(url) => handleOpenTabFromTree(url)}
            />
          ) : navigatorQuery.trim() ? (
            <div className="adl-multitree__empty">
              <p className="adl-empty-hint">{t.searchNoResults}</p>
            </div>
          ) : (
            <div className="adl-multitree__empty">
              <p className="adl-empty-hint">{t.searchBookmarkHistoryHint}</p>
            </div>
          )}
        </div>
      ) : null}
      <NavigatorResizeHandle
        label={t.resizeLabel}
        minWidth={180}
        maxWidth={300}
        currentWidth={browserNavigatorWidth}
        onPointerDown={handleNavigatorResizeStart}
      />
      {deleteBookmarksConfirmOpen ? (
        <div
          className="adl-dialog-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="browser-delete-bookmarks-confirm-title"
        >
          <div className="adl-dialog">
            <h3 id="browser-delete-bookmarks-confirm-title">
              {t.browserDeleteAllBookmarksConfirmTitle as string}
            </h3>
            <p>{t.browserDeleteAllBookmarksConfirmMessage as string}</p>
            <div className="adl-dialog__actions">
              <button
                type="button"
                onClick={() => {
                  setDeleteBookmarksConfirmOpen(false);
                  handleClearTabDirectories();
                }}
              >
                {t.browserDeleteAllBookmarksConfirmAction as string}
              </button>
              <button type="button" onClick={() => setDeleteBookmarksConfirmOpen(false)}>
                {t.cancel as string}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
