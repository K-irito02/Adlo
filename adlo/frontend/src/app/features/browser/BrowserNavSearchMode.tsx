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
  BookmarkEntry,
  BookmarkFolder,
} from '@stores/slices/browserTypes';
import { bookmarkUrlKey, isUrlBookmarked } from '@utils/browserDisplayUtils';
import { useOpenInCenterAction } from './useOpenInCenterAction';

export interface BrowserNavSearchModeProps {
  searchResults: { title: string; url: string; source: string }[];
  browserTabs: BrowserTabState[];
  browserHistory: BrowserHistoryState[];
  browserBookmarks: { title: string; url: string }[];
  browserBookmarkFolders: BookmarkFolder[];
  browserWorkspaceBookmarks: Record<string, BookmarkEntry[]>;
  onSelectResult: (url: string) => void;
  onRefreshTab: (tabId: string | undefined, url: string) => void;
  onEditTab: (tabId: string, name: string, url: string) => void;
  onDeleteTab: (tabId: string, url: string) => void;
  onCopyTabLink: (url: string) => void;
  onOpenTabInNewTab: (url: string, title?: string) => void;
  onOpenTabInCurrentTab: (tabId: string) => void;
  onRemoveBookmarkTab?: (tabId: string, url: string) => void;
}

type SearchSectionCallbacks = SectionCallbacks;

/**
 * 搜索标签结果列表（事项 10-c）：与"书签列表"同款行（真实 favicon + 标题、
 * 矮行、悬停灰底贴边、悬停刷新/更多键、右键更多操作菜单），滚动条与"已打开
 * 标签页"同款自定义细条。归属按搜索结果自身的 `source` 解析（已打开 > 收藏 >
 * 历史的合并优先级由 `mergeSearchResults` 写入），行操作锚定该来源的实体，
 * 保证菜单项真实有效。
 */
export function BrowserNavSearchMode({
  searchResults,
  browserTabs,
  browserHistory,
  browserBookmarks,
  browserBookmarkFolders,
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

  const items = useMemo<FlatItem[]>(() => {
    // 书签条目 / 标签 / 历史都用严格 URL 身份键匹配（协议+端口参与），
    // 否则 `http://host:3000/app` 与 `https://host:5173/app` 会互相锚定到
    // 错误的条目或标签，导致编辑/删除命中的是另一端口的对象。
    //
    // 同一严格 URL 可被收藏进多个目录（多条条目）：按搜索结果自身的标题
    // 匹配未使用条目，避免「搜索顺序 vs 目录顺序」不一致时删错副本。标题不匹配
    // 时**不回退**到其它条目——宁可少一个条目级动作，也不能把 A 条目的 id
    // 塞给 B 行（global-only 书签尤其如此）。
    const bookmarkEntriesByKey = new Map<string, { id: string; title: string }[]>();
    const addBookmarkEntry = (url: string, id: string, title: string) => {
      const key = bookmarkUrlKey(url);
      const entries = bookmarkEntriesByKey.get(key);
      if (entries) {
        entries.push({ id, title });
      } else {
        bookmarkEntriesByKey.set(key, [{ id, title }]);
      }
    };
    for (const folder of browserBookmarkFolders) {
      for (const item of folder.entries ?? []) {
        if (item.url && item.id) {
          addBookmarkEntry(item.url, item.id, item.title ?? '');
        }
      }
    }
    for (const entries of Object.values(browserWorkspaceBookmarks)) {
      for (const entry of entries ?? []) {
        if (entry.url && entry.id) {
          addBookmarkEntry(entry.url, entry.id, entry.title ?? '');
        }
      }
    }
    const usedBookmarkIds = new Set<string>();
    const takeBookmarkEntry = (key: string, title: string): { id: string } | undefined => {
      const entries = bookmarkEntriesByKey.get(key) ?? [];
      const unused = entries.filter((entry) => !usedBookmarkIds.has(entry.id));
      const chosen = unused.find((entry) => entry.title === title);
      if (chosen) {
        usedBookmarkIds.add(chosen.id);
      }
      return chosen;
    };

    return searchResults.map((result, index) => {
      const key = bookmarkUrlKey(result.url);
      const openTab = browserTabs.find((tab) => bookmarkUrlKey(tab.url) === key);
      const historyEntry = browserHistory.find((h) => bookmarkUrlKey(h.url) === key);
      // 归属以搜索结果自身的来源为准（`source` 由 mergeSearchResults 按
      // 已打开 > 收藏 > 历史 的合并优先级写入）：历史域搜出来的行即使该 URL
      // 也被收藏，仍应作为历史行删除历史，而不是删掉书签。
      const sourceIsOpen = result.source === t.browserOpenTabs && Boolean(openTab);
      const sourceIsSaved = result.source === t.browserSavedTabs;
      const sourceIsHistory = result.source === t.browserHistoryTabs && Boolean(historyEntry);
      const bookmarkCandidate =
        sourceIsOpen || sourceIsHistory ? undefined : takeBookmarkEntry(key, result.title);
      const isOpenTab = sourceIsOpen;
      // 收藏域（或没有更明确归属时）即使只剩全局索引、没有目录条目，也按书签行
      // 处理：保留快照标题语义与「取消收藏」入口，而不是误判成历史行。
      const isBookmarkRow =
        !isOpenTab && !sourceIsHistory && (sourceIsSaved || Boolean(bookmarkCandidate));
      const isHistoryRow = !isOpenTab && !isBookmarkRow;
      const node: BrowserTreeNode = {
        path: `search:${index}:${result.url}`,
        name: result.title,
        kind: 'file',
        children: [],
        nodeType: isOpenTab ? 'tab' : isBookmarkRow ? 'bookmark' : 'history',
        tabId: isOpenTab ? openTab!.id : isHistoryRow ? historyEntry?.id : undefined,
        bookmarkId: isBookmarkRow && bookmarkCandidate ? bookmarkCandidate.id : undefined,
        url: result.url,
        associatedTabId: openTab?.id,
        isPlayingAudio: openTab?.isPlayingAudio,
        isAudioMuted: openTab?.isAudioMuted,
        // 仅书签行走"只删收藏不关标签"分支（与书签列表收藏行一致）；
        // 已打开/历史行分别走关标签/删历史条目。
        isSavedBookmark: isBookmarkRow,
      };
      return { type: 'tab', node } as FlatItem;
    });
  }, [
    searchResults,
    browserTabs,
    browserHistory,
    browserBookmarkFolders,
    browserWorkspaceBookmarks,
    t.browserOpenTabs,
    t.browserSavedTabs,
    t.browserHistoryTabs,
  ]);

  const { openUrlInCenter } = useOpenInCenterAction();

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
      onOpenInCenter: openUrlInCenter,
      onRemoveBookmarkTab,
    }),
    [
      onRefreshTab,
      onEditTab,
      onDeleteTab,
      onCopyTabLink,
      onOpenTabInNewTab,
      onOpenTabInCurrentTab,
      openUrlInCenter,
      onRemoveBookmarkTab,
    ],
  );

  const menuItems: ContextMenuItem[] = useMemo(() => {
    if (!contextMenu) {
      return [];
    }
    const { node } = contextMenu;
    const isLive = !!node.associatedTabId;
    const isHistoryKind = node.nodeType === 'history';
    // 按归属裁剪死菜单（R1）：无 tabId 且无 bookmarkId 的行仅保留 url/name 级动作；
    // 在当前标签打开仅对存活标签有效；历史行不提供「编辑」（对话框按标签 id 写入，
    // 历史 id 会空转），但「刷新」仍可按历史 id 写回历史标题（与悬停按钮同口径）。
    const keep = (id: string): boolean => {
      switch (id) {
        case 'open-new':
        case 'copy-link':
        case 'bookmark-toggle':
          return true;
        case 'open-current':
          return isLive;
        case 'refresh':
          return !!node.url && (!isHistoryKind || !!node.tabId);
        case 'delete':
          return !!(node.bookmarkId || node.tabId);
        case 'edit':
          return !isHistoryKind && !!(node.bookmarkId || node.tabId);
        default:
          return true;
      }
    };
    return getTabContextMenuItems(node, sectionCallbacks, t, contextMenu.bookmarked)
      .filter((item) => keep(item.id))
      .map((item) => ({
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
            bookmarked: isUrlBookmarked(browserBookmarks, node.url),
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
