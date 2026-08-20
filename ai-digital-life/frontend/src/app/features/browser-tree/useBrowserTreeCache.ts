import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RecentWorkspaceEntry } from '@shared/ipc';
import type {
  BrowserTabState,
  TabFolderState,
  BrowserHistoryState,
  BrowserBookmark,
  WorkspaceBookmarkEntry,
} from '@stores/slices/browserSlice';
import type { BrowserCategoryState, BrowserTreeNode } from './types';
import {
  buildWorkspaceCategoryTree,
  buildUserFolderCategoryTree,
  buildHistoryCategoryTree,
} from './useBrowserTreeData';
import { getCachedTitle, isSiteMetaResolved, subscribeSiteMetaGlobal } from '@utils/siteMetaCache';
import { isPlaceholderTitle, resolveSiteTitle } from '@utils/browserDisplayUtils';

export interface UseBrowserTreeCacheInput {
  workspaces: RecentWorkspaceEntry[];
  browserTabs: BrowserTabState[];
  browserTabFolders: TabFolderState[];
  browserHistory: BrowserHistoryState[];
  browserWorkspaceBookmarks: Record<string, WorkspaceBookmarkEntry[]>;
  browserBookmarks: BrowserBookmark[];
  browserBookmarkTabIdUrlMap: Record<string, string>;
  labels: {
    workspaceCategory: string;
    userFolderCategory: string;
    historyCategory: string;
  };
  dateLabels: {
    year: string;
    month: string;
    day: string;
    history: string;
  };
}

export interface UseBrowserTreeCacheResult {
  workspaceCategory: BrowserCategoryState;
  userFolderCategory: BrowserCategoryState;
  historyCategory: BrowserCategoryState;
  workspaceNodes: BrowserTreeNode[];
  userFolderNodes: BrowserTreeNode[];
  historyNodes: BrowserTreeNode[];
}

export function useBrowserTreeCache(input: UseBrowserTreeCacheInput): UseBrowserTreeCacheResult {
  const {
    workspaces,
    browserTabs,
    browserTabFolders,
    browserHistory,
    browserWorkspaceBookmarks,
    browserBookmarks,
    browserBookmarkTabIdUrlMap,
    labels,
    dateLabels,
  } = input;

  const tabIdToUrl = browserBookmarkTabIdUrlMap;

  // 站点元数据镜像更新时强制重建收藏树节点标题（resolveSiteTitle 依赖 metaTitle/确认态）
  const [metaVersion, setMetaVersion] = useState(0);
  useEffect(() => subscribeSiteMetaGlobal(() => setMetaVersion((v) => v + 1)), []);

  // 标题解析：存储标题/缓存标题中取真实标题；未确认时不回退主机名（空占位），
  // 已确认仍无真实标题才回退主机名 —— 消除"主机名 → 真实标题"的中间态跳动。
  const resolveTitle = useCallback((title: string, url: string): string => {
    const metaTitle = getCachedTitle(url);
    const resolved = isSiteMetaResolved(url);
    const out = resolveSiteTitle(title, metaTitle, url, resolved);
    // 决策模式：real-stored（存储真实标题）/ real-meta（元数据真实标题）/
    // hostname（已结算仍无真实标题，主机名兜底）/ blank（未结算空占位）。
    const storedReal = Boolean(title) && !isPlaceholderTitle(title, url);
    const metaReal = Boolean(metaTitle) && !isPlaceholderTitle(metaTitle, url);
    const mode =
      storedReal || metaReal
        ? storedReal
          ? 'real-stored'
          : 'real-meta'
        : resolved
          ? 'hostname'
          : 'blank';
    const payload = { url, mode, storedTitle: title, metaTitle, resolved, shown: out };
    if (mode === 'hostname') {
      // 主机名兜底触发点：精确捕获"从主机名跳变到真实标题"的闪帧时刻与 URL。
      console.warn('[browser-title-hostname-fallback]', payload);
    } else {
      console.info('[browser-title-resolve] decision', payload);
    }
    return out;
  }, []);

  const workspaceNodes = useMemo(
    () =>
      buildWorkspaceCategoryTree(
        workspaces,
        browserTabs,
        browserTabFolders,
        browserWorkspaceBookmarks,
        browserBookmarks,
        tabIdToUrl,
        resolveTitle,
      ),
    [
      workspaces,
      browserTabs,
      browserTabFolders,
      browserWorkspaceBookmarks,
      browserBookmarks,
      tabIdToUrl,
      resolveTitle,
      metaVersion,
    ],
  );

  const workspaceCategory: BrowserCategoryState = useMemo(
    () => ({
      id: 'workspace',
      label: labels.workspaceCategory,
      isExpanded: true,
      isPermanent: false,
      nodes: workspaceNodes,
    }),
    [workspaceNodes, labels.workspaceCategory],
  );

  const userFolderNodes = useMemo(
    () =>
      buildUserFolderCategoryTree(
        browserTabFolders,
        browserTabs,
        browserBookmarks,
        tabIdToUrl,
        resolveTitle,
      ),
    [browserTabFolders, browserTabs, browserBookmarks, tabIdToUrl, resolveTitle, metaVersion],
  );

  const userFolderCategory: BrowserCategoryState = useMemo(
    () => ({
      id: 'userFolder',
      label: labels.userFolderCategory,
      isExpanded: true,
      isPermanent: false,
      nodes: userFolderNodes,
    }),
    [userFolderNodes, labels.userFolderCategory],
  );

  const historyNodes = useMemo(
    () => buildHistoryCategoryTree(browserHistory, browserTabs, dateLabels, resolveTitle),
    [browserHistory, browserTabs, dateLabels, resolveTitle, metaVersion],
  );

  const historyCategory: BrowserCategoryState = useMemo(
    () => ({
      id: 'history',
      label: labels.historyCategory,
      isExpanded: true,
      isPermanent: true,
      nodes: historyNodes,
    }),
    [historyNodes, labels.historyCategory],
  );

  return {
    workspaceCategory,
    userFolderCategory,
    historyCategory,
    workspaceNodes,
    userFolderNodes,
    historyNodes,
  };
}
