import type { RecentWorkspaceEntry } from '@shared/ipc';
import type {
  BrowserTabState,
  BookmarkEntry,
  BookmarkFolder,
  BrowserHistoryState,
} from '@stores/slices/browserSlice';
import type { BrowserCategoryState, BrowserCategoryType, BrowserTreeNode } from './types';
import {
  CUSTOM_ROOT,
  folderContainerKey,
  resolveContainerChildren,
  workspaceContainerKey,
} from '@stores/slices/browserBookmarkOrder';
import { bookmarkUrlKey, normalizeTabTitle } from '@utils/browserDisplayUtils';
import { useBrowserTreeCache } from './useBrowserTreeCache';
import { useBrowserTreeVirtualization } from './useBrowserTreeVirtualization';
import { useTCopy } from '@app/i18n/useTCopy';

export function countDirectFileChildren(node: BrowserTreeNode): number {
  let n = 0;
  for (const child of node.children) {
    if (child.kind === 'file') {
      n += 1;
    }
  }
  return n;
}

export function countDirectChildren(node: BrowserTreeNode): number {
  return node.children.length;
}

export function getCountStrategy(
  categoryType: BrowserCategoryType,
): (node: BrowserTreeNode) => number {
  return categoryType === 'history' ? countDirectChildren : countDirectFileChildren;
}

export function resolveChildCount(
  counts: Map<string, number>,
  childNode: BrowserTreeNode,
): number | null {
  if (childNode.kind === 'file') {
    return null;
  }
  return counts.get(childNode.path) ?? 0;
}

function buildHistoryLeafNode(
  entry: BrowserHistoryState,
  _uniqueKey: string,
  browserTabs: BrowserTabState[],
  resolveTitle?: (title: string, url: string) => string,
): BrowserTreeNode {
  let isPlayingAudio = false;
  let isAudioMuted = false;
  let associatedTabId: string | undefined;

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const entryDate = new Date(entry.visitedAt);
  const entryDateStr = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, '0')}-${String(entryDate.getDate()).padStart(2, '0')}`;

  if (entryDateStr === todayStr) {
    // 归一化匹配当前打开的标签（剥离跟踪参数/尾斜杠/www）：URL 变体（如 B 站
    // 尾斜杠、YouTube 追加参数）也能关联到正在播放的标签，音量图标稳定显示
    // （2026-08-21 事项 7：此前 t.url === entry.url 精确匹配导致图标缺失/闪烁）。
    const entryKey = bookmarkUrlKey(entry.url);
    const matchedTab = browserTabs.find((t) => bookmarkUrlKey(t.url) === entryKey);
    if (matchedTab) {
      isPlayingAudio = matchedTab.isPlayingAudio;
      isAudioMuted = matchedTab.isAudioMuted;
      associatedTabId = matchedTab.id;
    }
  }

  return {
    path: `history-entry:${entry.id}`,
    // 传入结算感知解析器时走 resolveSiteTitle（未结算空占位，避免"主机名→真实标题"跳变）；
    // 缺省保持原 normalizeTabTitle 行为（向后兼容测试/无缓存场景）。
    name: resolveTitle
      ? resolveTitle(entry.title, entry.url)
      : normalizeTabTitle(entry.title, entry.url),
    kind: 'file',
    children: [],
    nodeType: 'history',
    tabId: entry.id,
    url: entry.url,
    visitedAt: entry.visitedAt,
    isPlayingAudio,
    isAudioMuted,
    associatedTabId,
  };
}

function buildBookmarkEntryNode(
  entry: BookmarkEntry,
  workspaceId: string,
  path: string,
  resolveTitle: (title: string, url: string) => string,
): BrowserTreeNode | null {
  if (!entry.id || !entry.url) {
    return null;
  }
  const node: BrowserTreeNode = {
    path,
    name: resolveTitle(entry.title, entry.url),
    kind: 'file',
    children: [],
    nodeType: 'bookmark',
    bookmarkId: entry.id,
    url: entry.url,
    workspaceId,
    isSavedBookmark: true,
  };
  if (entry.iconUri) {
    node.iconUri = entry.iconUri;
  }
  return node;
}

function buildFolderNode(
  folder: BookmarkFolder,
  allFolders: BookmarkFolder[],
  workspaceBookmarks: Record<string, BookmarkEntry[]>,
  order: Record<string, string[]>,
  resolveTitle: (title: string, url: string) => string = () => '',
  parentWorkspaceId?: string,
): BrowserTreeNode {
  const children = resolveContainerChildren(
    {
      browserBookmarkFolders: allFolders,
      browserWorkspaceBookmarks: workspaceBookmarks,
      browserBookmarkChildOrder: order,
    },
    folderContainerKey(folder.id),
  )
    .map((child) => {
      if (child.kind === 'folder') {
        const childFolder = allFolders.find((item) => item.id === child.id);
        return childFolder
          ? buildFolderNode(
              childFolder,
              allFolders,
              workspaceBookmarks,
              order,
              resolveTitle,
              parentWorkspaceId,
            )
          : null;
      }
      const entry = (folder.entries ?? []).find((item) => item.id === child.id);
      if (!entry) {
        return null;
      }
      return buildBookmarkEntryNode(
        entry,
        parentWorkspaceId || '',
        `bookmark:${entry.id}::${encodeURIComponent(entry.url)}`,
        resolveTitle,
      );
    })
    .filter(Boolean) as BrowserTreeNode[];

  return {
    path: `folder:${folder.id}`,
    name: folder.name,
    kind: 'directory',
    children,
    nodeType: 'folder',
    folderId: folder.id,
    workspaceId: parentWorkspaceId,
  };
}

export function buildWorkspaceCategoryTree(
  workspaces: RecentWorkspaceEntry[],
  tabFolders: BookmarkFolder[],
  workspaceBookmarks: Record<string, BookmarkEntry[]> = {},
  resolveTitle: (title: string, url: string) => string = () => '',
  order: Record<string, string[]> = {},
): BrowserTreeNode[] {
  return workspaces.map((ws) => {
    const children = resolveContainerChildren(
      {
        browserBookmarkFolders: tabFolders,
        browserWorkspaceBookmarks: workspaceBookmarks,
        browserBookmarkChildOrder: order,
      },
      workspaceContainerKey(ws.id),
    )
      .map((child) => {
        if (child.kind === 'folder') {
          const folder = tabFolders.find((item) => item.id === child.id);
          return folder
            ? buildFolderNode(folder, tabFolders, workspaceBookmarks, order, resolveTitle, ws.id)
            : null;
        }
        const entry = (workspaceBookmarks[ws.id] ?? []).find((item) => item.id === child.id);
        if (!entry) {
          return null;
        }
        return buildBookmarkEntryNode(
          entry,
          ws.id,
          `bookmark:${ws.id}:${entry.id}:${encodeURIComponent(entry.url)}`,
          resolveTitle,
        );
      })
      .filter(Boolean) as BrowserTreeNode[];

    return {
      path: `workspace:${ws.id}`,
      name: ws.name || ws.path,
      kind: 'directory',
      children,
      nodeType: 'workspace',
      workspaceId: ws.id,
    };
  });
}

export function buildUserFolderCategoryTree(
  tabFolders: BookmarkFolder[],
  workspaceBookmarks: Record<string, BookmarkEntry[]>,
  resolveTitle: (title: string, url: string) => string = () => '',
  order: Record<string, string[]> = {},
): BrowserTreeNode[] {
  return resolveContainerChildren(
    {
      browserBookmarkFolders: tabFolders,
      browserWorkspaceBookmarks: workspaceBookmarks,
      browserBookmarkChildOrder: order,
    },
    CUSTOM_ROOT,
  )
    .map((child) => {
      if (child.kind !== 'folder') {
        return null;
      }
      const folder = tabFolders.find((item) => item.id === child.id);
      return folder
        ? buildFolderNode(folder, tabFolders, workspaceBookmarks, order, resolveTitle)
        : null;
    })
    .filter(Boolean) as BrowserTreeNode[];
}

export function buildHistoryCategoryTree(
  history: BrowserHistoryState[],
  browserTabs: BrowserTabState[],
  dateLabels: { year: string; month: string; day: string; history: string },
  resolveTitle?: (title: string, url: string) => string,
): BrowserTreeNode[] {
  const groupMap = new Map<string, Map<string, Map<string, BrowserHistoryState[]>>>();

  for (const entry of history) {
    const d = new Date(entry.visitedAt);
    const year = String(d.getFullYear());
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    if (!groupMap.has(year)) {
      groupMap.set(year, new Map());
    }
    const yearMap = groupMap.get(year)!;
    if (!yearMap.has(month)) {
      yearMap.set(month, new Map());
    }
    const monthMap = yearMap.get(month)!;
    if (!monthMap.has(day)) {
      monthMap.set(day, []);
    }
    monthMap.get(day)!.push(entry);
  }

  const result: BrowserTreeNode[] = [];

  const sortedYears = [...groupMap.keys()].sort((a, b) => Number(b) - Number(a));
  for (const year of sortedYears) {
    const yearMap = groupMap.get(year)!;
    const yearNode: BrowserTreeNode = {
      path: `history:year:${year}`,
      name: `${year}${dateLabels.year}`,
      kind: 'directory',
      children: [],
      nodeType: 'year',
    };

    const sortedMonths = [...yearMap.keys()].sort((a, b) => Number(b) - Number(a));
    for (const month of sortedMonths) {
      const monthMap = yearMap.get(month)!;
      const monthNode: BrowserTreeNode = {
        path: `history:month:${year}-${month}`,
        name: `${Number(month)}${dateLabels.month}`,
        kind: 'directory',
        children: [],
        nodeType: 'month',
      };

      const sortedDays = [...monthMap.keys()].sort((a, b) => Number(b) - Number(a));
      for (const day of sortedDays) {
        const entries = monthMap.get(day)!;
        const dayNode: BrowserTreeNode = {
          path: `history:day:${year}-${month}-${day}`,
          name: `${Number(day)}${dateLabels.day}`,
          kind: 'directory',
          children: entries
            .map((entry) => buildHistoryLeafNode(entry, entry.id, browserTabs, resolveTitle))
            .filter((n) => n.name),
          nodeType: 'day',
        };
        monthNode.children.push(dayNode);
      }
      yearNode.children.push(monthNode);
    }
    result.push(yearNode);
  }

  const historyRoot: BrowserTreeNode = {
    path: 'history:root',
    name: dateLabels.history,
    kind: 'directory',
    children: result,
    nodeType: 'history',
  };

  // 空历史也保留「历史记录」根目录：删除全部后顶层不能消失；
  // 展开时由 BrowserTreeEntry 显示「暂无历史记录」空态。
  return [historyRoot];
}

export interface UseBrowserTreeDataResult {
  workspaceCategory: BrowserCategoryState;
  userFolderCategory: BrowserCategoryState;
  historyCategory: BrowserCategoryState;
  counts: Map<string, number>;
}

export function useBrowserTreeData(
  workspaces: RecentWorkspaceEntry[],
  browserTabs: BrowserTabState[],
  browserBookmarkFolders: BookmarkFolder[],
  browserBookmarkChildOrder: Record<string, string[]>,
  browserHistory: BrowserHistoryState[],
  browserWorkspaceBookmarks: Record<string, BookmarkEntry[]>,
  labels: {
    workspaceCategory: string;
    userFolderCategory: string;
    historyCategory: string;
  },
): UseBrowserTreeDataResult {
  const { t } = useTCopy();
  const dateLabels = {
    year: t.browserDateYear,
    month: t.browserDateMonth,
    day: t.browserDateDay,
    history: t.browserHistory,
  };
  const {
    workspaceCategory,
    userFolderCategory,
    historyCategory,
    workspaceNodes,
    userFolderNodes,
    historyNodes,
  } = useBrowserTreeCache({
    workspaces,
    browserTabs,
    browserBookmarkFolders,
    browserBookmarkChildOrder,
    browserHistory,
    browserWorkspaceBookmarks,
    labels,
    dateLabels,
  });

  const { counts } = useBrowserTreeVirtualization({
    workspaceNodes,
    userFolderNodes,
    historyNodes,
  });

  return { workspaceCategory, userFolderCategory, historyCategory, counts };
}
