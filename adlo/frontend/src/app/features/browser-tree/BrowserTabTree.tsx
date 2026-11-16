import { useCallback } from 'react';
import { useBrowserTreeData } from './useBrowserTreeData';
import { BrowserCategorySection } from './BrowserCategorySection';
import { BrowserTreeDndOverlay } from './BrowserTreeDndOverlay';
import { useBrowserTreeDnd } from './useBrowserTreeDnd';
import { CustomScrollArea } from '@features/file-tree/CustomScrollArea';
import type { BrowserCategoryType } from './types';
import type { RecentWorkspaceEntry } from '@shared/ipc';
import type {
  BrowserTabState,
  BookmarkEntry,
  BookmarkFolder,
  BrowserHistoryState,
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
  onRefreshTab: (tabId: string | undefined, url: string) => void;
  onEditTab: (tabId: string, name: string, url: string) => void;
  onDeleteTab: (tabId: string, url: string) => void;
  onCopyTabLink: (url: string) => void;
  onOpenTabInNewTab: (url: string, title?: string) => void;
  onOpenTabInCurrentTab: (url: string) => void;
  onOpenInCenter?: (url: string, title?: string) => void;
  onOpenAllInCenter?: (categoryType: BrowserCategoryType, nodePath: string) => void;
  onCloseTab?: (tabId: string) => void;
  onBookmarkTab?: (url: string, title: string) => void;
  onRemoveBookmarkTab?: (tabId: string, url: string) => void;
}

interface BrowserTabTreeProps {
  workspaces: RecentWorkspaceEntry[];
  browserTabs: BrowserTabState[];
  browserBookmarkFolders: BookmarkFolder[];
  browserBookmarkChildOrder?: Record<string, string[]>;
  browserHistory: BrowserHistoryState[];
  browserWorkspaceBookmarks: Record<string, BookmarkEntry[]>;
  tabTreeExpanded: Record<string, boolean>;
  selectedTreePath: string | null;
  onSelectTreePath: (path: string | null) => void;
  onTogglePath: (path: string) => void;
  callbacks: BrowserTabTreeCallbacks;
  labels: BrowserCategoryLabels;
  browserViewMode?: 'tree' | 'list' | 'all';
}

export function BrowserTabTree({
  workspaces,
  browserTabs,
  browserBookmarkFolders,
  browserBookmarkChildOrder = {},
  browserHistory,
  browserWorkspaceBookmarks,
  tabTreeExpanded,
  selectedTreePath,
  onSelectTreePath,
  onTogglePath,
  callbacks,
  labels,
  browserViewMode,
}: BrowserTabTreeProps) {
  const categories = useBrowserTreeData(
    workspaces,
    browserTabs,
    browserBookmarkFolders,
    browserBookmarkChildOrder,
    browserHistory,
    browserWorkspaceBookmarks,
    labels,
  );

  const dnd = useBrowserTreeDnd(categories);

  const handleOpenFile = useCallback(
    (nodePath: string) => {
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
              const entry = entries.find((e) => e.id === second);
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
    [browserHistory, browserWorkspaceBookmarks, callbacks],
  );

  return (
    <div className="adl-browser-tree-dnd-root" {...dnd.handlers}>
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
        />
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
      </CustomScrollArea>
      <BrowserTreeDndOverlay indicator={dnd.indicator} />
    </div>
  );
}
