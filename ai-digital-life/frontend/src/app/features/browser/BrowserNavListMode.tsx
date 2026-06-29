import React from 'react';
import { BrowserTabTree } from '@features/browser-tree';
import type { BrowserNavTabsModeProps } from './BrowserNavTabsMode';

export type BrowserNavListModeProps = Omit<BrowserNavTabsModeProps, 'onBookmarkTab' | 'onRemoveBookmarkTab'>;

export function BrowserNavListMode({
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
  labels,
}: BrowserNavListModeProps) {
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
      browserViewMode="list"
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
      }}
      labels={labels}
    />
  );
}