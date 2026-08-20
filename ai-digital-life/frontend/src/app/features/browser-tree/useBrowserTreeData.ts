import type { RecentWorkspaceEntry } from '@shared/ipc';
import type {
  BrowserTabState,
  TabFolderState,
  BrowserHistoryState,
  BrowserBookmark,
  WorkspaceBookmarkEntry,
} from '@stores/slices/browserSlice';
import type { BrowserCategoryState, BrowserCategoryType, BrowserTreeNode } from './types';
import { historyDedupKey, normalizeTabTitle } from '@utils/browserDisplayUtils';
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

function buildTabNode(
  tab: BrowserTabState,
  workspaceId: string,
  uniqueKey: string,
  resolveTitle: (title: string, url: string) => string,
): BrowserTreeNode {
  return {
    path: `tab:${uniqueKey}:${tab.id}`,
    name: resolveTitle(tab.title, tab.url),
    kind: 'file',
    children: [],
    nodeType: 'tab',
    tabId: tab.id,
    url: tab.url,
    workspaceId,
    isPlayingAudio: tab.isPlayingAudio,
    isAudioMuted: tab.isAudioMuted,
  };
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
    const entryKey = historyDedupKey(entry.url);
    const matchedTab = browserTabs.find((t) => historyDedupKey(t.url) === entryKey);
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

function getBookmarkForTabOverride(
  tabId: string,
  tabUrl: string | undefined,
  browserBookmarks: BrowserBookmark[],
  tabIdToUrlMap: Record<string, string>,
): { url: string; title: string } | undefined {
  const originalUrl = tabIdToUrlMap[tabId];
  if (originalUrl) {
    const bm = browserBookmarks.find((b) => b.url === originalUrl);
    if (bm) {
      return bm;
    }
  }
  if (tabUrl) {
    const bm = browserBookmarks.find((b) => b.url === tabUrl);
    if (bm) {
      return bm;
    }
  }
  return undefined;
}

function buildFolderNode(
  folder: TabFolderState,
  allFolders: TabFolderState[],
  browserTabs: BrowserTabState[],
  depth: number = 0,
  parentWorkspaceId?: string,
  browserBookmarks: BrowserBookmark[] = [],
  tabIdToUrlMap: Record<string, string> = {},
  resolveTitle: (title: string, url: string) => string = () => '',
): BrowserTreeNode {
  const childFolders = allFolders.filter(
    (f) => f.parentId === folder.id && (!f.parentType || f.parentType === 'folder'),
  );
  const tabChildren: BrowserTreeNode[] = (folder.tabs ?? [])
    .map((item) => {
      const { tabId, url: snapshotUrl, title: snapshotTitle } = item;
      const tab = browserTabs.find((t) => t.id === tabId);
      if (!tab) {
        if (snapshotUrl) {
          return {
            path: `bookmark:${tabId}::${encodeURIComponent(snapshotUrl)}`,
            name: resolveTitle(snapshotTitle, snapshotUrl),
            kind: 'file' as const,
            children: [],
            nodeType: 'tab' as const,
            tabId,
            url: snapshotUrl,
            workspaceId: parentWorkspaceId || '',
            isPlayingAudio: false,
            isAudioMuted: false,
            isSavedBookmark: true,
          };
        }
        return null;
      }
      const displayUrl = snapshotUrl || tab.url || '';
      const node = buildTabNode(
        tab,
        tab.workspaceId,
        `folder-${folder.id}-${tabId}-${encodeURIComponent(displayUrl)}`,
        resolveTitle,
      );
      node.isSavedBookmark = true;
      // 使用文件夹级快照，保留收藏时的原始 URL/标题
      node.name = resolveTitle(snapshotTitle || tab.title || '', displayUrl);
      node.url = displayUrl;
      // 收藏条目：仅在标签仍在收藏的 URL（归一化匹配，剥离跟踪参数/尾斜杠/www）上
      // 时才保留音频状态——URL 变体不丢失音量图标（2026-08-21 事项 7）。
      if (snapshotUrl && historyDedupKey(tab.url) !== historyDedupKey(snapshotUrl)) {
        node.isPlayingAudio = false;
        node.isAudioMuted = false;
      }
      return node;
    })
    .filter(Boolean) as BrowserTreeNode[];

  const folderChildren: BrowserTreeNode[] = childFolders.map((child) =>
    buildFolderNode(
      child,
      allFolders,
      browserTabs,
      depth + 1,
      parentWorkspaceId,
      browserBookmarks,
      tabIdToUrlMap,
      resolveTitle,
    ),
  );

  return {
    path: `folder:${folder.id}`,
    name: folder.name,
    kind: 'directory',
    children: [...tabChildren, ...folderChildren],
    nodeType: 'folder',
    folderId: folder.id,
    workspaceId: parentWorkspaceId,
  };
}

export function buildWorkspaceCategoryTree(
  workspaces: RecentWorkspaceEntry[],
  browserTabs: BrowserTabState[],
  tabFolders: TabFolderState[],
  workspaceBookmarks: Record<string, WorkspaceBookmarkEntry[]> = {},
  browserBookmarks: BrowserBookmark[] = [],
  tabIdToUrlMap: Record<string, string> = {},
  resolveTitle: (title: string, url: string) => string = () => '',
): BrowserTreeNode[] {
  return workspaces.map((ws) => {
    const wsTabs = browserTabs.filter((t) => t.workspaceId === ws.id);
    const tabNodes: BrowserTreeNode[] = wsTabs.map((tab) =>
      buildTabNode(tab, ws.id, `ws-${ws.id}-${tab.id}`, resolveTitle),
    );

    // 添加工作区级别的书签标签（使用快照数据）
    const bookmarkedEntries = workspaceBookmarks[ws.id] || [];
    const bookmarkNodes: BrowserTreeNode[] = bookmarkedEntries
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        if (!entry.tabId) {
          return null;
        }
        // 避免重复添加已存在的标签
        if (wsTabs.some((t) => t.id === entry.tabId)) {
          return null;
        }
        const tab = browserTabs.find((t) => t.id === entry.tabId);

        // 从 entry 中获取快照 URL/标题
        let snapshotTitle = entry.title || '';
        let snapshotUrl = entry.url || '';
        // 若无快照，从 tabId→URL 映射查找
        if (!snapshotUrl) {
          const fallbackSnap = getBookmarkForTabOverride(
            entry.tabId,
            tab?.url,
            browserBookmarks,
            tabIdToUrlMap,
          );
          if (fallbackSnap) {
            snapshotTitle = fallbackSnap.title;
            snapshotUrl = fallbackSnap.url;
          }
        }

        // 跳过无有效 URL 的条目
        if (!snapshotUrl) {
          return null;
        }

        let node: BrowserTreeNode;
        if (tab) {
          node = buildTabNode(
            tab,
            ws.id,
            `ws-bookmark-${ws.id}-${entry.tabId}-${encodeURIComponent(snapshotUrl)}`,
            resolveTitle,
          );
          node.name = resolveTitle(snapshotTitle, snapshotUrl);
          node.url = snapshotUrl;
        } else {
          node = {
            path: `bookmark:${ws.id}:${entry.tabId}:${encodeURIComponent(snapshotUrl)}`,
            name: resolveTitle(snapshotTitle, snapshotUrl),
            kind: 'file' as const,
            children: [],
            nodeType: 'tab' as const,
            tabId: entry.tabId,
            url: snapshotUrl,
            workspaceId: ws.id,
            isPlayingAudio: false,
            isAudioMuted: false,
          };
        }
        // 收藏条目：标签仍在该快照 URL（归一化匹配）上时保留音频状态（音量图标），
        // 否则清除——URL 变体不丢失图标（2026-08-21 事项 7：此前"始终清除"导致
        // 书签/收藏目录不显示音量图标）。
        const keepAudio = Boolean(
          tab && snapshotUrl && historyDedupKey(tab.url) === historyDedupKey(snapshotUrl),
        );
        node.isPlayingAudio = keepAudio ? tab!.isPlayingAudio : false;
        node.isAudioMuted = keepAudio ? tab!.isAudioMuted : false;
        node.isSavedBookmark = true;
        return node;
      })
      .filter(Boolean) as BrowserTreeNode[];

    const wsRootFolders = tabFolders.filter(
      (f) => f.parentType === 'workspace' && f.parentId === ws.id,
    );
    const folderNodes: BrowserTreeNode[] = wsRootFolders.map((folder) =>
      buildFolderNode(
        folder,
        tabFolders,
        browserTabs,
        0,
        ws.id,
        browserBookmarks,
        tabIdToUrlMap,
        resolveTitle,
      ),
    );

    return {
      path: `workspace:${ws.id}`,
      name: ws.name || ws.path,
      kind: 'directory',
      children: [...tabNodes, ...bookmarkNodes, ...folderNodes],
      nodeType: 'workspace',
      workspaceId: ws.id,
    };
  });
}

export function buildUserFolderCategoryTree(
  tabFolders: TabFolderState[],
  browserTabs: BrowserTabState[],
  browserBookmarks: BrowserBookmark[] = [],
  tabIdToUrlMap: Record<string, string> = {},
  resolveTitle: (title: string, url: string) => string = () => '',
): BrowserTreeNode[] {
  const rootFolders = tabFolders.filter((f) => !f.parentId);
  return rootFolders.map((folder) =>
    buildFolderNode(
      folder,
      tabFolders,
      browserTabs,
      0,
      undefined,
      browserBookmarks,
      tabIdToUrlMap,
      resolveTitle,
    ),
  );
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
  browserTabFolders: TabFolderState[],
  browserHistory: BrowserHistoryState[],
  browserWorkspaceBookmarks: Record<string, WorkspaceBookmarkEntry[]>,
  browserBookmarks: BrowserBookmark[],
  browserBookmarkTabIdUrlMap: Record<string, string>,
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
    browserTabFolders,
    browserHistory,
    browserWorkspaceBookmarks,
    browserBookmarks,
    browserBookmarkTabIdUrlMap,
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
