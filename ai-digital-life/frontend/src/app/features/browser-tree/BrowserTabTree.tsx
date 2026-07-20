import { useCallback, useMemo } from 'react';
import { useBrowserTreeData } from './useBrowserTreeData';
import { BrowserCategorySection } from './BrowserCategorySection';
import { CustomScrollArea } from '@features/file-tree/CustomScrollArea';
import type { BrowserCategoryType } from './types';
import type { RecentWorkspaceEntry } from '@shared/ipc';
import type {
  BrowserTabState,
  TabFolderState,
  BrowserHistoryState,
  BrowserBookmark,
  WorkspaceBookmarkEntry,
} from '@stores/slices/browserSlice';

interface BrowserCategoryLabels {
  workspaceCategory: string;
  userFolderCategory: string;
  historyCategory: string;
}

interface BrowserTabTreeCallbacks {
  onCreateTab: (workspaceId?: string, folderId?: string) => void;
  onDeleteAllChildTabs: (categoryType: BrowserCategoryType, nodePath: string) => void;
  onDeleteOwnChildTabs: (categoryType: BrowserCategoryType, nodePath: string) => void;
  onOpenAllInNewTabs: (categoryType: BrowserCategoryType, nodePath: string) => void;
  onRemoveFromArea: (workspaceId: string) => void;
  onDeleteDirectory: (folderId: string) => void;
  onRenameDirectory: (folderId: string) => void;
  onDeleteHistory: (level: 'label' | 'year' | 'month' | 'day', nodePath: string) => void;
  onOpenTab: (url: string, tabId?: string) => void;
  // Tab-level operations
  onRefreshTab: (tabId: string, url: string) => void;
  onEditTab: (tabId: string, name: string, url: string) => void;
  onDeleteTab: (tabId: string, url: string) => void;
  onCopyTabLink: (url: string) => void;
  onOpenTabInNewTab: (url: string, title: string) => void;
  onOpenTabInCurrentTab: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void;
  onBookmarkTab?: (url: string, title: string) => void;
  onRemoveBookmarkTab?: (tabId: string, url: string) => void;
}

interface BrowserTabTreeProps {
  workspaces: RecentWorkspaceEntry[];
  browserTabs: BrowserTabState[];
  browserTabFolders: TabFolderState[];
  browserHistory: BrowserHistoryState[];
  browserWorkspaceBookmarks: Record<string, WorkspaceBookmarkEntry[]>;
  browserBookmarks?: BrowserBookmark[];
  browserBookmarkTabIdUrlMap?: Record<string, string>;
  tabTreeExpanded: Record<string, boolean>;
  selectedTreePath: string | null;
  onSelectTreePath: (path: string | null) => void;
  onTogglePath: (path: string) => void;
  callbacks: BrowserTabTreeCallbacks;
  labels: BrowserCategoryLabels;
  browserViewMode?: 'tree' | 'list' | 'all';
  onlyOpenTabs?: boolean;
}

function findWorkspaceBookmarkUrl(
  bookmarks: Record<string, WorkspaceBookmarkEntry[]>,
  tabId: string,
  uniqueKey: string,
): string | undefined {
  for (const [wsId, entries] of Object.entries(bookmarks)) {
    for (const entry of entries) {
      if (entry.tabId === tabId && entry.url) {
        const expected = `ws-bookmark-${wsId}-${entry.tabId}-${encodeURIComponent(entry.url)}`;
        if (expected === uniqueKey) {
          return entry.url;
        }
      }
    }
  }
  return undefined;
}

function findFolderBookmarkUrl(
  folders: TabFolderState[],
  tabId: string,
  uniqueKey: string,
): string | undefined {
  for (const folder of folders) {
    if (!folder.tabs) {
      continue;
    }
    for (const entry of folder.tabs) {
      if (entry.tabId === tabId && entry.url) {
        const expected = `folder-${folder.id}-${entry.tabId}-${encodeURIComponent(entry.url)}`;
        if (expected === uniqueKey) {
          return entry.url;
        }
      }
    }
  }
  return undefined;
}

export function BrowserTabTree({
  workspaces,
  browserTabs,
  browserTabFolders,
  browserHistory,
  browserWorkspaceBookmarks,
  browserBookmarks,
  browserBookmarkTabIdUrlMap,
  tabTreeExpanded,
  selectedTreePath,
  onSelectTreePath,
  onTogglePath,
  callbacks,
  labels,
  browserViewMode,
  onlyOpenTabs = false,
}: BrowserTabTreeProps) {
  const categories = useBrowserTreeData(
    workspaces,
    browserTabs,
    browserTabFolders,
    browserHistory,
    browserWorkspaceBookmarks,
    browserBookmarks ?? [],
    browserBookmarkTabIdUrlMap ?? {},
    labels,
  );

  const openTabIds = useMemo(
    () => (onlyOpenTabs ? new Set(browserTabs.map((t) => t.id)) : undefined),
    [onlyOpenTabs, browserTabs],
  );

  const handleOpenFile = useCallback(
    (nodePath: string) => {
      if (nodePath.startsWith('tab:')) {
        const rest = nodePath.slice('tab:'.length);
        const lastColon = rest.lastIndexOf(':');
        const uniqueKey = lastColon >= 0 ? rest.slice(0, lastColon) : '';
        const tabId = lastColon >= 0 ? rest.slice(lastColon + 1) : rest;

        if (uniqueKey.startsWith('ws-bookmark-') || uniqueKey.startsWith('folder-')) {
          const bookmarkUrl = uniqueKey.startsWith('ws-bookmark-')
            ? findWorkspaceBookmarkUrl(browserWorkspaceBookmarks, tabId, uniqueKey)
            : findFolderBookmarkUrl(browserTabFolders, tabId, uniqueKey);
          if (bookmarkUrl) {
            callbacks.onOpenTab(bookmarkUrl);
            return;
          }
        }

        const tab = browserTabs.find((t) => t.id === tabId);
        if (tab) {
          callbacks.onOpenTab(tab.url, tab.id);
          return;
        }
      }
      if (nodePath.startsWith('bookmark:')) {
        const rest = nodePath.slice('bookmark:'.length);
        const parts = rest.split(':');
        if (parts.length >= 2) {
          const first = parts[0];
          const second = parts[1];
          let url = '';
          if (parts.length >= 3) {
            try {
              url = decodeURIComponent(parts.slice(2).join(':'));
            } catch {
              url = '';
            }
          }
          if (second) {
            const entries = browserWorkspaceBookmarks[first];
            if (entries) {
              const entry = entries.find((e) => e.tabId === second);
              if (entry?.url) {
                callbacks.onOpenTab(entry.url);
                return;
              }
            }
          }
          if (url) {
            callbacks.onOpenTab(url);
            return;
          }
        }
        return;
      }
      if (nodePath.startsWith('history-entry:')) {
        const entryId = nodePath.slice('history-entry:'.length);
        const histEntry = browserHistory.find((h) => h.id === entryId);
        if (histEntry) {
          callbacks.onOpenTab(histEntry.url);
        }
      }
    },
    [browserTabs, browserHistory, browserWorkspaceBookmarks, browserTabFolders, callbacks],
  );

  return (
    <CustomScrollArea
      shellClassName="adl-multitree adl-multitree--browser"
      scrollClassName="adl-multitree-scroll"
      scrollbarClassName="adl-multitree-scrollbar"
      thumbClassName="adl-multitree-scrollbar__thumb"
    >
      <BrowserCategorySection
        category={categories.workspaceCategory}
        categoryType="workspace"
        expandedPaths={tabTreeExpanded}
        selectedTreePath={selectedTreePath}
        onSelectTreePath={onSelectTreePath}
        onTogglePath={onTogglePath}
        onOpenFile={handleOpenFile}
        callbacks={callbacks}
        counts={categories.counts}
        browserViewMode={browserViewMode}
        filterTabIds={openTabIds}
      />
      <BrowserCategorySection
        category={categories.userFolderCategory}
        categoryType="userFolder"
        expandedPaths={tabTreeExpanded}
        selectedTreePath={selectedTreePath}
        onSelectTreePath={onSelectTreePath}
        onTogglePath={onTogglePath}
        onOpenFile={handleOpenFile}
        callbacks={callbacks}
        counts={categories.counts}
        browserViewMode={browserViewMode}
        filterTabIds={openTabIds}
      />
      {!onlyOpenTabs && (
        <BrowserCategorySection
          category={categories.historyCategory}
          categoryType="history"
          expandedPaths={tabTreeExpanded}
          selectedTreePath={selectedTreePath}
          onSelectTreePath={onSelectTreePath}
          onTogglePath={onTogglePath}
          onOpenFile={handleOpenFile}
          callbacks={callbacks}
          counts={categories.counts}
          browserViewMode={browserViewMode}
        />
      )}
    </CustomScrollArea>
  );
}
