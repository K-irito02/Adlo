import { useMemo } from 'react';
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

  const workspaceNodes = useMemo(
    () =>
      buildWorkspaceCategoryTree(
        workspaces,
        browserTabs,
        browserTabFolders,
        browserWorkspaceBookmarks,
        browserBookmarks,
        tabIdToUrl
      ),
    [
      workspaces,
      browserTabs,
      browserTabFolders,
      browserWorkspaceBookmarks,
      browserBookmarks,
      tabIdToUrl,
    ]
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
    () => buildUserFolderCategoryTree(browserTabFolders, browserTabs, browserBookmarks, tabIdToUrl),
    [browserTabFolders, browserTabs, browserBookmarks, tabIdToUrl]
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

  const historyNodes = useMemo(
    () => buildHistoryCategoryTree(browserHistory, browserTabs, dateLabels),
    [browserHistory, browserTabs, dateLabels]
  );

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

  return {
    workspaceCategory,
    userFolderCategory,
    historyCategory,
    workspaceNodes,
    userFolderNodes,
    historyNodes,
  };
}
