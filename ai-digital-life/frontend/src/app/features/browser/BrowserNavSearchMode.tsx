import { useMemo, useState } from 'react';
import { BrowserTreeEntryFlatList } from '@features/browser-tree/BrowserTreeEntryFlatList';
import { getTabContextMenuItems } from '@features/browser-tree/browserEntrySubEntriesUtils';
import type { SectionCallbacks } from '@features/browser-tree/BrowserCategorySection';
import type { BrowserTreeNode } from '@features/browser-tree/types';
import type { FlatItem } from '@features/browser-tree/browserTreeEntryUtils';
import { ContextMenu, type ContextMenuItem } from '@components/ContextMenu';
import { CustomScrollArea } from '@features/file-tree/CustomScrollArea';
import { useTCopy } from '@i18n/useTCopy';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import type {
  BrowserHistoryState,
  TabFolderState,
  WorkspaceBookmarkEntry,
} from '@stores/slices/browserTypes';
import { historyDedupKey } from '@utils/browserDisplayUtils';

export interface BrowserNavSearchModeProps {
  searchResults: { title: string; url: string; source: string }[];
  browserTabs: BrowserTabState[];
  browserHistory: BrowserHistoryState[];
  browserBookmarks: { title: string; url: string }[];
  browserTabFolders: TabFolderState[];
  browserWorkspaceBookmarks: Record<string, WorkspaceBookmarkEntry[]>;
  onSelectResult: (url: string) => void;
  onRefreshTab: (tabId: string, url: string) => void;
  onEditTab: (tabId: string, name: string, url: string) => void;
  onDeleteTab: (tabId: string, url: string) => void;
  onCopyTabLink: (url: string) => void;
  onOpenTabInNewTab: (url: string, title?: string) => void;
  onOpenTabInCurrentTab: (tabId: string) => void;
  onRemoveBookmarkTab?: (tabId: string, url: string) => void;
}

type SearchSectionCallbacks = SectionCallbacks;

/**
 * 搜索标签结果列表（事项 10-c）：与"文件列表"同款行（真实 favicon + 标题、
 * 矮行、悬停灰底贴边、悬停刷新/更多键、右键更多操作菜单），滚动条与"已打开
 * 标签页"同款自定义细条。归属按 已打开 > 收藏 > 历史解析（与 useBrowserSearch
 * 合并优先级一致），行操作锚定最鲜活的归属，保证菜单项真实有效。
 */
export function BrowserNavSearchMode({
  searchResults,
  browserTabs,
  browserHistory,
  browserBookmarks,
  browserTabFolders,
  browserWorkspaceBookmarks,
  onSelectResult,
  onRefreshTab,
  onEditTab,
  onDeleteTab,
  onCopyTabLink,
  onOpenTabInNewTab,
  onOpenTabInCurrentTab,
  onRemoveBookmarkTab,
}: BrowserNavSearchModeProps) {
  const { t } = useTCopy();
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: BrowserTreeNode;
    bookmarked: boolean;
  } | null>(null);

  const bookmarkedKeys = useMemo(
    () => new Set(browserBookmarks.map((b) => JSON.stringify([b.url, b.title]))),
    [browserBookmarks],
  );

  const items = useMemo<FlatItem[]>(() => {
    const snapshotTabIdByUrl = new Map<string, string>();
    for (const folder of browserTabFolders) {
      for (const item of folder.tabs ?? []) {
        if (item.url && item.tabId && !snapshotTabIdByUrl.has(historyDedupKey(item.url))) {
          snapshotTabIdByUrl.set(historyDedupKey(item.url), item.tabId);
        }
      }
    }
    for (const entries of Object.values(browserWorkspaceBookmarks)) {
      for (const entry of entries ?? []) {
        if (entry.url && entry.tabId && !snapshotTabIdByUrl.has(historyDedupKey(entry.url))) {
          snapshotTabIdByUrl.set(historyDedupKey(entry.url), entry.tabId);
        }
      }
    }
    return searchResults.map((result, index) => {
      const key = historyDedupKey(result.url);
      const openTab = browserTabs.find((tab) => historyDedupKey(tab.url) === key);
      const historyEntry = browserHistory.find((h) => historyDedupKey(h.url) === key);
      const snapshotTabId = snapshotTabIdByUrl.get(key);
      const tabId = openTab?.id ?? historyEntry?.id ?? snapshotTabId;
      const node: BrowserTreeNode = {
        path: `search:${index}:${result.url}`,
        name: result.title,
        kind: 'file',
        children: [],
        nodeType: openTab ? 'tab' : historyEntry ? 'history' : 'tab',
        tabId,
        url: result.url,
        associatedTabId: openTab?.id,
        isPlayingAudio: openTab?.isPlayingAudio,
        isAudioMuted: openTab?.isAudioMuted,
        // 仅纯收藏行走"只删收藏不关标签"分支（与文件列表收藏行一致）；
        // 已打开/历史行分别走关标签/删历史条目。
        isSavedBookmark: !openTab && !historyEntry,
      };
      return { type: 'tab', node } as FlatItem;
    });
  }, [searchResults, browserTabs, browserHistory, browserTabFolders, browserWorkspaceBookmarks]);

  const sectionCallbacks = useMemo<SearchSectionCallbacks>(
    () => ({
      onCreateTab: () => {},
      onDeleteAllChildTabs: () => {},
      onDeleteOwnChildTabs: () => {},
      onOpenAllInNewTabs: () => {},
      onRemoveFromArea: () => {},
      onDeleteDirectory: () => {},
      onRenameDirectory: () => {},
      onDeleteHistory: () => {},
      onOpenTab: () => {},
      onRefreshTab,
      onEditTab,
      onDeleteTab,
      onCopyTabLink,
      onOpenTabInNewTab,
      onOpenTabInCurrentTab,
      onRemoveBookmarkTab,
    }),
    [
      onRefreshTab,
      onEditTab,
      onDeleteTab,
      onCopyTabLink,
      onOpenTabInNewTab,
      onOpenTabInCurrentTab,
      onRemoveBookmarkTab,
    ],
  );

  const menuItems: ContextMenuItem[] = useMemo(() => {
    if (!contextMenu) {
      return [];
    }
    return getTabContextMenuItems(
      contextMenu.node,
      sectionCallbacks,
      t,
      contextMenu.bookmarked,
    ).map((item) => ({
      id: item.id,
      label: item.label,
      badge: item.badge,
      danger: item.danger,
      hint: item.hint,
      action: item.action,
    }));
  }, [contextMenu, sectionCallbacks, t]);

  return (
    <CustomScrollArea
      shellClassName="adl-multitree adl-multitree--browser"
      scrollClassName="adl-multitree-scroll"
      scrollbarClassName="adl-multitree-scrollbar"
      thumbClassName="adl-multitree-scrollbar__thumb"
    >
      <BrowserTreeEntryFlatList
        flatItems={items}
        selectedTreePath={null}
        onFlatTabClick={(node) => {
          if (node.url) {
            onSelectResult(node.url);
          }
        }}
        onTabContextMenu={(x, y, node) => {
          setContextMenu({
            x,
            y,
            node,
            bookmarked:
              node.url != null &&
              node.name != null &&
              bookmarkedKeys.has(JSON.stringify([node.url, node.name])),
          });
        }}
        onRefreshTab={onRefreshTab}
      />
      {contextMenu && (
        <ContextMenu
          items={menuItems}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </CustomScrollArea>
  );
}
