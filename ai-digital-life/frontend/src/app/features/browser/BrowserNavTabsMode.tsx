import React from 'react';
import { BrowserTabTree } from '@features/browser-tree';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import type { BrowserBookmark } from '@stores/slices/browserSlice';
import type { TabFolderState } from '@stores/slices/browserFoldersSlice';
import type { BrowserHistoryState } from '@stores/slices/browserHistorySlice';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import type { WorkspaceBookmarkEntry } from '@stores/slices/browserSlice';

export interface BrowserNavTabsModeProps {
  visibleWorkspaces: RecentWorkspaceEntry[];
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
  onCreateTab: (workspaceId?: string, folderId?: string) => void;
  onDeleteAllChildTabs: (categoryType: string, nodePath: string) => void;
  onDeleteOwnChildTabs: (categoryType: string, nodePath: string) => void;
  onOpenAllInNewTabs: (categoryType: string, nodePath: string) => void;
  onRemoveFromArea: (workspaceId: string) => void;
  onDeleteDirectory: (folderId: string) => void;
  onRenameDirectory: (folderId: string) => void;
  onDeleteHistory: (level: 'label' | 'year' | 'month' | 'day', nodePath: string) => void;
  onOpenTab: (url: string, tabId?: string) => void;
  onRefreshTab: (tabId: string, url: string) => void;
  onEditTab: (tabId: string, name: string, url: string) => void;
  onDeleteTab: (tabId: string, url: string) => void;
  onCopyTabLink: (url: string) => void;
  onOpenTabInNewTab: (url: string, title: string) => void;
  onOpenTabInCurrentTab: (tabId: string) => void;
  onBookmarkTab?: (url: string, title: string) => void;
  onRemoveBookmarkTab?: (tabId: string, url: string) => void;
  labels: {
    workspaceCategory: string;
    userFolderCategory: string;
    historyCategory: string;
  };
}

export function BrowserNavTabsMode({
  visibleWorkspaces,
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
  onBookmarkTab,
  onRemoveBookmarkTab,
  labels,
}: BrowserNavTabsModeProps) {
  return (
    <BrowserTabTree
      workspaces={visibleWorkspaces}
      browserTabs={browserTabs}
      browserTabFolders={browserTabFolders}
      browserHistory={browserHistory}
      browserWorkspaceBookmarks={browserWorkspaceBookmarks}
      browserBookmarks={browserBookmarks}
      browserBookmarkTabIdUrlMap={browserBookmarkTabIdUrlMap}
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
        onBookmarkTab,
        onRemoveBookmarkTab,
      }}
      labels={labels}
    />
  );
}
