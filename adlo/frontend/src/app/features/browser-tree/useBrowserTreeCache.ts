import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RecentWorkspaceEntry } from '@shared/ipc';
import type {
  BrowserTabState,
  BookmarkEntry,
  BookmarkFolder,
  BrowserHistoryState,
} from '@stores/slices/browserSlice';
import type { BrowserCategoryState, BrowserTreeNode } from './types';
import {
  buildWorkspaceCategoryTree,
  buildUserFolderCategoryTree,
  buildHistoryCategoryTree,
} from './useBrowserTreeData';
import {
  getCachedTitle,
  isSiteMetaResolvedForTree,
  subscribeSiteMetaGlobal,
} from '@utils/siteMetaCache';
import { resolveSiteTitle } from '@utils/browserDisplayUtils';

export interface UseBrowserTreeCacheInput {
  workspaces: RecentWorkspaceEntry[];
  browserTabs: BrowserTabState[];
  browserBookmarkFolders: BookmarkFolder[];
  browserBookmarkChildOrder: Record<string, string[]>;
  browserHistory: BrowserHistoryState[];
  browserWorkspaceBookmarks: Record<string, BookmarkEntry[]>;
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
    browserBookmarkFolders,
    browserBookmarkChildOrder,
    browserHistory,
    browserWorkspaceBookmarks,
    labels,
    dateLabels,
  } = input;

  // 站点元数据镜像更新时强制重建书签树节点标题（resolveSiteTitle 依赖 metaTitle/确认态）
  const [metaVersion, setMetaVersion] = useState(0);
  useEffect(() => subscribeSiteMetaGlobal(() => setMetaVersion((v) => v + 1)), []);

  // 标题解析：存储标题/缓存标题中取真实标题；未确认时不回退主机名（空占位），
  // 已确认仍无真实标题才回退主机名 —— 消除"主机名 → 真实标题"的中间态跳动。
  const resolveTitle = useCallback((title: string, url: string): string => {
    const metaTitle = getCachedTitle(url);
    const resolved = isSiteMetaResolvedForTree(url);
    return resolveSiteTitle(title, metaTitle, url, resolved);
  }, []);

  /* eslint-disable react-hooks/exhaustive-deps -- meta-version 脏标记：site meta 全局更新时 +1 强制重 build 树以重新 resolve 标题（依赖仅作触发信号，body 未直接引用） */

  const workspaceNodes = useMemo(
    () =>
      buildWorkspaceCategoryTree(
        workspaces,
        browserBookmarkFolders,
        browserWorkspaceBookmarks,
        resolveTitle,
        browserBookmarkChildOrder,
      ),
    [
      workspaces,
      browserBookmarkFolders,
      browserBookmarkChildOrder,
      browserWorkspaceBookmarks,
      resolveTitle,
      metaVersion,
    ],
  );

  const workspaceCategory: BrowserCategoryState = useMemo(
    () => ({
      label: labels.workspaceCategory,
      nodes: workspaceNodes,
    }),
    [workspaceNodes, labels.workspaceCategory],
  );

  const userFolderNodes = useMemo(
    () =>
      buildUserFolderCategoryTree(
        browserBookmarkFolders,
        browserWorkspaceBookmarks,
        resolveTitle,
        browserBookmarkChildOrder,
      ),
    [
      browserBookmarkFolders,
      browserBookmarkChildOrder,
      browserWorkspaceBookmarks,
      resolveTitle,
      metaVersion,
    ],
  );

  const userFolderCategory: BrowserCategoryState = useMemo(
    () => ({
      label: labels.userFolderCategory,
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
      label: labels.historyCategory,
      nodes: historyNodes,
    }),
    [historyNodes, labels.historyCategory],
  );

  /* eslint-enable react-hooks/exhaustive-deps */

  return {
    workspaceCategory,
    userFolderCategory,
    historyCategory,
    workspaceNodes,
    userFolderNodes,
    historyNodes,
  };
}
