import { BrowserTabTree } from '@features/browser-tree';
import type { BrowserNavTabsModeProps } from './BrowserNavTabsMode';

export type BrowserNavListModeProps = Omit<
  BrowserNavTabsModeProps,
  'onBookmarkTab' | 'onRemoveBookmarkTab'
>;

export function BrowserNavListMode({
  visibleWorkspaces,
  browserTabs,
  browserBookmarkFolders,
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
  labels,
}: BrowserNavListModeProps) {
  return (
    <BrowserTabTree
      workspaces={visibleWorkspaces}
      browserTabs={browserTabs}
      browserBookmarkFolders={browserBookmarkFolders}
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
      }}
      labels={labels}
    />
  );
}
