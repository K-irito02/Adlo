/**
 * Git 切片
 * 管理 Git 快照、分支等状态
 *
 * Git 快照数据源说明：
 *
 * 项目中存在两个 Git 快照数据源，各有不同用途：
 *
 * 1. gitSlice.gitSnapshot (本切片)
 *    - 用途：当前工作区的快速访问，用于右侧面板（Changes panel）、badge 计数等
 *    - 更新时机：bootstrap()、fetchGitStatus()、switchGitBranch()、createGitBranch()
 *    - 特点：只存储当前工作区的快照，单例模式
 *
 * 2. workspaceSlice.gitSnapshots
 *    - 用途：所有工作区的 Git 快照，用于多工作区视图（文件树、变更树、Git 可视化）
 *    - 更新时机：bootstrap()、loadGitSnapshot()、refreshGitSnapshot()、
 *               switchGitBranch()、createGitBranch()、applyGitOperation()
 *    - 特点：存储所有工作区的快照，Record<workspaceId, GitSnapshot> 格式
 *
 * 设计说明：
 * 两个数据源并存是为了支持用户便利性和性能稳定性：
 * - 每个工作区相当于一个 tab 页面，可以独立刷新
 * - 每个工作区内有"刷新全部图表"按钮，只刷新当前工作区的图表
 * - 每个图表有单独的"刷新"按钮，只刷新当前图表
 * - 避免同时并发刷新所有工作区和图表
 *
 * 注意：更新 gitSnapshot 时，应同步更新 gitSnapshots[workspaceId]，反之亦然。
 */
import type { GitSnapshot, GitBranchSummary } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';

export interface GitSlice {
  /**
   * 当前工作区的 Git 快照（单例模式）
   * 用途：右侧面板（Changes panel）、badge 计数等需要快速访问的场景
   * 更新时机：bootstrap()、fetchGitStatus()、switchGitBranch()、createGitBranch()
   */
  gitSnapshot?: GitSnapshot;
  gitBranches: GitBranchSummary[];
  gitStashRestored?: boolean;

  setGitSnapshot: (snapshot: GitSnapshot | undefined) => void;
  setGitBranches: (branches: GitBranchSummary[]) => void;
  setGitStashRestored: (restored: boolean) => void;
}

export const createGitSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): GitSlice => ({
  gitBranches: [],

  setGitSnapshot: (snapshot) => set({ gitSnapshot: snapshot }),
  setGitBranches: (branches) => set({ gitBranches: branches }),
  setGitStashRestored: (restored) => set({ gitStashRestored: restored }),
});
