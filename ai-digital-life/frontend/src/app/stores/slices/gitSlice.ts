/**
 * Git 切片
 * 管理 Git 快照、分支等状态
 */
import type {
  GitSnapshot,
  GitBranchSummary,
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
} from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';

export interface GitSlice {
  gitSnapshot?: GitSnapshot;
  gitBranches: GitBranchSummary[];

  setGitSnapshot: (snapshot: GitSnapshot | undefined) => void;
  setGitBranches: (branches: GitBranchSummary[]) => void;
  clearGitState: () => void;
}

export const createGitSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState
): GitSlice => ({
  gitBranches: [],

  setGitSnapshot: (snapshot) => set({ gitSnapshot: snapshot }),
  setGitBranches: (branches) => set({ gitBranches: branches }),
  clearGitState: () => set({ gitSnapshot: undefined, gitBranches: [] }),
});
