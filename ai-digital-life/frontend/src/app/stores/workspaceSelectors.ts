/**
 * 工作区相关的选择器
 */

import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from './slicedStore';
import type { StoreState } from './StoreState';

export const workspaceSelectors = {
  getAppInfo: (state: StoreState) => state.appInfo,
  useAppInfo: () => useAppStore(useShallow((s) => s.appInfo)),

  getCurrentWorkspace: (state: StoreState) => state.appInfo?.currentWorkspace,
  useCurrentWorkspace: () => useAppStore(useShallow((s) => s.appInfo?.currentWorkspace)),

  getRecentWorkspaces: (state: StoreState) => state.recentWorkspaces,
  useRecentWorkspaces: () => useAppStore(useShallow((s) => s.recentWorkspaces)),

  getGitBranches: (state: StoreState) => state.gitBranches,
  useGitBranches: () => useAppStore(useShallow((s) => s.gitBranches)),

  getIndexingStatus: (state: StoreState) => state.indexingStatus,
  useIndexingStatus: () => useAppStore(useShallow((s) => s.indexingStatus)),

  getRepoMap: (state: StoreState) => state.repoMap,
  useRepoMap: () => useAppStore(useShallow((s) => s.repoMap)),

  hasCurrentWorkspace: (state: StoreState) => Boolean(state.appInfo?.currentWorkspace),
  useHasCurrentWorkspace: () => useAppStore((s) => Boolean(s.appInfo?.currentWorkspace)),

  getWorkspaceId: (state: StoreState) => state.appInfo?.currentWorkspace?.id,
  useWorkspaceId: () => useAppStore((s) => s.appInfo?.currentWorkspace?.id),
};
