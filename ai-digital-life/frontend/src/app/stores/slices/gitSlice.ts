/**
 * Git 切片
 * 管理 Git 快照、分支等状态
 */
import type { GitSnapshot, GitBranchSummary } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';

export interface GitSlice {
  gitSnapshot?: GitSnapshot;
  gitBranches: GitBranchSummary[];
  gitStashRestored?: boolean;

  setGitSnapshot: (snapshot: GitSnapshot | undefined) => void;
  setGitBranches: (branches: GitBranchSummary[]) => void;
  setGitStashRestored: (restored: boolean) => void;
  clearGitState: () => void;
}

export const createGitSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): GitSlice => ({
  gitBranches: [],

  setGitSnapshot: (snapshot) => set({ gitSnapshot: snapshot }),
  setGitBranches: (branches) => set({ gitBranches: branches }),
  setGitStashRestored: (restored) => set({ gitStashRestored: restored }),
  clearGitState: () =>
    set({ gitSnapshot: undefined, gitBranches: [], gitStashRestored: undefined }),
});
