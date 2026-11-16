import { BrowserTabTree } from '@features/browser-tree';
import type { BrowserNavTabsModeProps } from './BrowserNavTabsMode';

// 列表模式与目录模式必须共用同一套书签动作：列表里的收藏行同样要能取消收藏 /
// 移除条目，不能因为少传回调而静默失效。
export type BrowserNavListModeProps = BrowserNavTabsModeProps;

export function BrowserNavListMode({
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
}: BrowserNavListModeProps) {
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
        onOpenInCenter,
        onOpenAllInCenter,
        onBookmarkTab,
        onRemoveBookmarkTab,
      }}
      labels={labels}
    />
  );
}
