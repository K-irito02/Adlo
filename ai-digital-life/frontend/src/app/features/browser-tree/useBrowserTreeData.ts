import { useMemo } from 'react';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import type {
  BrowserTabState,
  TabFolderState,
  BrowserHistoryState,
} from '../../stores/slices/browserslice';
import type { BrowserCategoryState, BrowserCategoryType, BrowserTreeNode } from './types';

export function countDirectFileChildren(node: BrowserTreeNode): number {
  let n = 0;
  for (const child of node.children) {
    if (child.kind === 'file') n += 1;
  }
  return n;
}

export function countDirectChildren(node: BrowserTreeNode): number {
  return node.children.length;
}

export function getCountStrategy(
  categoryType: BrowserCategoryType
): (node: BrowserTreeNode) => number {
  return categoryType === 'history' ? countDirectChildren : countDirectFileChildren;
}

export function resolveChildCount(
  counts: Map<string, number>,
  childNode: BrowserTreeNode
): number | null {
  if (childNode.kind === 'file') return null;
  return counts.get(childNode.path) ?? 0;
}

function buildTabNode(
  tab: BrowserTabState,
  workspaceId: string,
  _uniqueKey: string
): BrowserTreeNode {
  return {
    path: `tab:${workspaceId}:${tab.id}`,
    name: tab.title || '无标题',
    kind: 'file',
    children: [],
    nodeType: 'tab',
    tabId: tab.id,
    url: tab.url,
    workspaceId,
  };
}

function buildHistoryLeafNode(entry: BrowserHistoryState, _uniqueKey: string): BrowserTreeNode {
  return {
    path: `history-entry:${entry.id}`,
    name: entry.title || entry.url,
    kind: 'file',
    children: [],
    nodeType: 'history',
    tabId: entry.id,
    url: entry.url,
    visitedAt: entry.visitedAt,
  };
}

function buildFolderNode(
  folder: TabFolderState,
  allFolders: TabFolderState[],
  browserTabs: BrowserTabState[],
  depth: number = 0
): BrowserTreeNode {
  const childFolders = allFolders.filter(
    (f) => f.parentId === folder.id && (!f.parentType || f.parentType === 'folder')
  );
  const tabChildren: BrowserTreeNode[] = (folder.tabs ?? [])
    .map((tabId) => {
      const tab = browserTabs.find((t) => t.id === tabId);
      if (!tab) return null;
      return buildTabNode(tab, tab.workspaceId, `folder-${folder.id}-${tabId}`);
    })
    .filter(Boolean) as BrowserTreeNode[];

  const folderChildren: BrowserTreeNode[] = childFolders.map((child) =>
    buildFolderNode(child, allFolders, browserTabs, depth + 1)
  );

  return {
    path: `folder:${folder.id}`,
    name: folder.name,
    kind: 'directory',
    children: [...folderChildren, ...tabChildren],
    nodeType: 'folder',
    folderId: folder.id,
  };
}

export function buildWorkspaceCategoryTree(
  workspaces: RecentWorkspaceEntry[],
  browserTabs: BrowserTabState[],
  tabFolders: TabFolderState[]
): BrowserTreeNode[] {
  return workspaces.map((ws) => {
    const wsTabs = browserTabs.filter((t) => t.workspaceId === ws.id);
    const tabNodes: BrowserTreeNode[] = wsTabs.map((tab) =>
      buildTabNode(tab, ws.id, `ws-${ws.id}-${tab.id}`)
    );

    const wsRootFolders = tabFolders.filter(
      (f) => f.parentType === 'workspace' && f.parentId === ws.id
    );
    const folderNodes: BrowserTreeNode[] = wsRootFolders.map((folder) =>
      buildFolderNode(folder, tabFolders, browserTabs)
    );

    return {
      path: `workspace:${ws.id}`,
      name: ws.name || ws.path,
      kind: 'directory',
      children: [...folderNodes, ...tabNodes],
      nodeType: 'workspace',
      workspaceId: ws.id,
    };
  });
}

export function buildUserFolderCategoryTree(
  tabFolders: TabFolderState[],
  browserTabs: BrowserTabState[]
): BrowserTreeNode[] {
  const rootFolders = tabFolders.filter((f) => !f.parentId);
  return rootFolders.map((folder) => buildFolderNode(folder, tabFolders, browserTabs));
}

export function buildHistoryCategoryTree(history: BrowserHistoryState[]): BrowserTreeNode[] {
  const groupMap = new Map<string, Map<string, Map<string, BrowserHistoryState[]>>>();

  for (const entry of history) {
    const d = new Date(entry.visitedAt);
    const year = String(d.getFullYear());
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    if (!groupMap.has(year)) groupMap.set(year, new Map());
    const yearMap = groupMap.get(year)!;
    if (!yearMap.has(month)) yearMap.set(month, new Map());
    const monthMap = yearMap.get(month)!;
    if (!monthMap.has(day)) monthMap.set(day, []);
    monthMap.get(day)!.push(entry);
  }

  const result: BrowserTreeNode[] = [];

  const sortedYears = [...groupMap.keys()].sort((a, b) => Number(b) - Number(a));
  for (const year of sortedYears) {
    const yearMap = groupMap.get(year)!;
    const yearNode: BrowserTreeNode = {
      path: `history:year:${year}`,
      name: `${year}年`,
      kind: 'directory',
      children: [],
      nodeType: 'year',
    };

    const sortedMonths = [...yearMap.keys()].sort((a, b) => Number(b) - Number(a));
    for (const month of sortedMonths) {
      const monthMap = yearMap.get(month)!;
      const monthNode: BrowserTreeNode = {
        path: `history:month:${year}-${month}`,
        name: `${Number(month)}月`,
        kind: 'directory',
        children: [],
        nodeType: 'month',
      };

      const sortedDays = [...monthMap.keys()].sort((a, b) => Number(b) - Number(a));
      for (const day of sortedDays) {
        const entries = monthMap.get(day)!;
        const dayNode: BrowserTreeNode = {
          path: `history:day:${year}-${month}-${day}`,
          name: `${Number(day)}日`,
          kind: 'directory',
          children: entries.map((entry) => buildHistoryLeafNode(entry, entry.id)),
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
    name: '历史记录',
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
  labels: {
    workspaceCategory: string;
    userFolderCategory: string;
    historyCategory: string;
  }
): UseBrowserTreeDataResult {
  const workspaceNodes = useMemo(
    () => buildWorkspaceCategoryTree(workspaces, browserTabs, browserTabFolders),
    [workspaces, browserTabs, browserTabFolders]
  );

  const workspaceCategory: BrowserCategoryState = useMemo(
    () => ({
      id: 'workspace',
      label: labels.workspaceCategory,
      isExpanded: true,
      isPermanent: false,
      nodes: workspaceNodes,
    }),
    [workspaceNodes, labels.workspaceCategory]
  );

  const userFolderNodes = useMemo(
    () => buildUserFolderCategoryTree(browserTabFolders, browserTabs),
    [browserTabFolders, browserTabs]
  );

  const userFolderCategory: BrowserCategoryState = useMemo(
    () => ({
      id: 'userFolder',
      label: labels.userFolderCategory,
      isExpanded: true,
      isPermanent: false,
      nodes: userFolderNodes,
    }),
    [userFolderNodes, labels.userFolderCategory]
  );

  const historyNodes = useMemo(() => buildHistoryCategoryTree(browserHistory), [browserHistory]);

  const historyCategory: BrowserCategoryState = useMemo(
    () => ({
      id: 'history',
      label: labels.historyCategory,
      isExpanded: true,
      isPermanent: true,
      nodes: historyNodes,
    }),
    [historyNodes, labels.historyCategory]
  );

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    const visit = (categoryType: BrowserCategoryType, nodes: BrowserTreeNode[]) => {
      const stack: { type: BrowserCategoryType; nodes: BrowserTreeNode[] }[] = [
        { type: categoryType, nodes },
      ];
      while (stack.length > 0) {
        const { type, nodes: items } = stack.pop()!;
        const strategyFn = getCountStrategy(type);
        for (const item of items) {
          if (item.kind === 'directory') {
            map.set(item.path, strategyFn(item));
            if (item.children.length > 0) stack.push({ type, nodes: item.children });
          }
        }
      }
    };
    visit('workspace', workspaceNodes);
    visit('userFolder', userFolderNodes);
    visit('history', historyNodes);
    return map;
  }, [workspaceNodes, userFolderNodes, historyNodes]);

  return { workspaceCategory, userFolderCategory, historyCategory, counts };
}
