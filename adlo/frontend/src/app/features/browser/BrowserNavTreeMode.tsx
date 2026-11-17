import { BrowserTabTree } from '@features/browser-tree';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import type { BookmarkFolder } from '@stores/slices/browserFoldersSlice';
import type { BrowserHistoryState } from '@stores/slices/browserHistorySlice';
import type { RecentWorkspaceEntry } from '@shared/ipc';
import type { BookmarkEntry } from '@stores/slices/browserSlice';

export interface BrowserNavTreeModeProps {
  visibleWorkspaces: RecentWorkspaceEntry[];
  browserTabs: BrowserTabState[];
  browserBookmarkFolders: BookmarkFolder[];
  browserBookmarkChildOrder: Record<string, string[]>;
  browserHistory: BrowserHistoryState[];
  browserWorkspaceBookmarks: Record<string, BookmarkEntry[]>;
  tabTreeExpanded: Record<string, boolean>;
  selectedTreePath: string | null;
  onSelectTreePath: (path: string | null) => void;
  onTogglePath: (path: string) => void;
  onCreateTab: (workspaceId?: string, folderId?: string) => void;
  onDeleteAllChildTabs: (categoryType: string, nodePath: string) => void;
  onDeleteOwnChildTabs: (categoryType: string, nodePath: string) => void;
  onOpenAllInNewTabs: (categoryType: string, nodePath: string) => void;
  onRemoveFromArea: (workspaceId: string) => void;
  onDeleteDirectory: (folderId: string) => void;
  onRenameDirectory: (folderId: string) => void;
  onDeleteHistory: (level: 'label' | 'year' | 'month' | 'day', nodePath: string) => void;
  onOpenTab: (url: string, tabId?: string) => void;
  onRefreshTab: (tabId: string | undefined, url: string) => void;
  onEditTab: (tabId: string, name: string, url: string) => void;
  onDeleteTab: (tabId: string, url: string) => void;
  onCopyTabLink: (url: string) => void;
  onOpenTabInNewTab: (url: string, title?: string) => void;
  onOpenTabInCurrentTab: (tabId: string) => void;
  onOpenInCenter: (url: string, title?: string) => void;
  onOpenAllInCenter: (categoryType: string, nodePath: string) => void;
  onBookmarkTab?: (url: string, title: string) => void;
  onRemoveBookmarkTab?: (tabId: string, url: string) => void;
  labels: {
    workspaceCategory: string;
    userFolderCategory: string;
    historyCategory: string;
  };
}

export function BrowserNavTreeMode({
  visibleWorkspaces,
  browserTabs,
  browserBookmarkFolders,
  browserBookmarkChildOrder,
  browserHistory,
  browserWorkspaceBookmarks,
  tabTreeExpanded,
  selectedTreePath,
  onSelectTreePath,
  onTogglePath,
  onCreateTab,
  onDeleteAllChildTabs,
  onDeleteOwnChildTabs,
  onOpenAllInNewTabs,
  onRemoveFromArea,
  onDeleteDirectory,
  onRenameDirectory,
  onDeleteHistory,
  onOpenTab,
  onRefreshTab,
  onEditTab,
  onDeleteTab,
  onCopyTabLink,
  onOpenTabInNewTab,
  onOpenTabInCurrentTab,
  onOpenInCenter,
  onOpenAllInCenter,
  onBookmarkTab,
  onRemoveBookmarkTab,
  labels,
}: BrowserNavTreeModeProps) {
  return (
    <BrowserTabTree
      workspaces={visibleWorkspaces}
      browserTabs={browserTabs}
      browserBookmarkFolders={browserBookmarkFolders}
      browserBookmarkChildOrder={browserBookmarkChildOrder}
      browserHistory={browserHistory}
      browserWorkspaceBookmarks={browserWorkspaceBookmarks}
      tabTreeExpanded={tabTreeExpanded}
      selectedTreePath={selectedTreePath}
      onSelectTreePath={onSelectTreePath}
      onTogglePath={onTogglePath}
      callbacks={{
        onCreateTab,
        onDeleteAllChildTabs,
        onDeleteOwnChildTabs,
        onOpenAllInNewTabs,
        onRemoveFromArea,
        onDeleteDirectory,
        onRenameDirectory,
        onDeleteHistory,
        onOpenTab,
        onRefreshTab,
        onEditTab,
        onDeleteTab,
        onCopyTabLink,
        onOpenTabInNewTab,
        onOpenTabInCurrentTab,
        onOpenInCenter,
        onOpenAllInCenter,
        onBookmarkTab,
        onRemoveBookmarkTab,
      }}
      labels={labels}
    />
  );
}
