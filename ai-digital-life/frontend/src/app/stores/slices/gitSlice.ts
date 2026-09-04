/**
 * Git 切片
 * 管理 Git 快照、分支等状态
 *
 * Git 快照在 store 中冗余存储于三处，各有不同用途：
 *
 * 1. gitSlice.gitSnapshot (本切片, Source A)
 *    - 用途：当前工作区的快速访问单例，用于右侧 Changes 面板、badge 计数
 *    - 写入方：fetchGitStatus()、applyGitOperation()、switchGitBranch()、createGitBranch()、
 *              bootstrap()，以及 loadGitSnapshot()/refreshGitSnapshot()（当目标工作区是当前工作区时）
 *    - 特点：只描述「当前工作区」，因此仅当操作目标是当前工作区时才会被写入
 *
 * 2. workspaceSlice.gitSnapshots (Source B)
 *    - 用途：所有工作区的快照映射，多工作区视图（文件树、变更树、Git 可视化）按工作区 ID 读取
 *    - 写入方：bootstrap()、loadGitSnapshot()、refreshGitSnapshot()、fetchGitStatus()、
 *              applyGitOperation()、switchGitBranch()、createGitBranch()
 *    - 特点：Record<workspaceId, GitSnapshot>，支持按工作区独立刷新；写入均为合并写，不清空其它槽位
 *
 * 3. workspaceSlice.appInfo.currentWorkspace.gitSnapshot (Source C)
 *    - 用途：后端 workspace metadata 上的快照字段，作为 badge/header 的兜底来源
 *    - 写入方：fetchGitStatus()、switchGitBranch()、createGitBranch()（后端返回权威 metadata），
 *              以及经同步 helper 写入的其它当前工作区操作
 *
 * 设计说明：
 * 三处冗余并存是为了支持用户便利性和性能稳定性：
 * - 每个工作区相当于一个 tab 页面，可以独立刷新
 * - 每个工作区内有"刷新全部图表"按钮，只刷新当前工作区的图表
 * - 每个图表有单独的"刷新"按钮，只刷新当前图表
 * - 避免同时并发刷新所有工作区和图表
 *
 * 同步不变量：把一个工作区的最新「完整」快照写入 store 时，应经
 * buildGitSnapshotSyncPatch()（stores/gitSnapshotSync.ts）统一执行，由该 helper 保证：
 * - B 恒写 gitSnapshots[workspaceId]（合并写，不动其它槽位）
 * - 当 workspaceId === 当前工作区 id 时，A（gitSnapshot）与 C（currentWorkspace.gitSnapshot）一并更新
 * 以下写入方须经 helper：fetchGitStatus、loadGitSnapshot/refreshGitSnapshot（成功回调）、
 * switchGitBranch、createGitBranch、applyGitOperation、bootstrap 当前工作区 getGitStatus。
 * 例外（已知、受控，不逐槽经 helper）：bootstrap 无当前工作区复位分支（整体清空）、
 * bootstrap loadBatch 级联批量写 B（accumulateBatch，内容与后续 getGitStatus 同源近似）。
 * 禁止在 action 内手工展开写入单例 A 或整表替换 B，否则会造成 A/B/C 漂移
 * （参见 93 轮重构历史中的相关教训）。
 */
import type { GitSnapshot, GitBranchSummary } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';

export interface GitSlice {
  /**
   * 当前工作区的 Git 快照（单例，Source A）
   * 用途：右侧 Changes 面板、badge 计数等需要快速访问的场景
   * 仅在操作目标是当前工作区时更新（fetchGitStatus/applyGitOperation/switch/create/bootstrap 等）
   * 注意：不要经 setter 直写本字段，须通过 stores/gitSnapshotSync.ts 的
   * buildGitSnapshotSyncPatch() 与 B/C 一并同步（见文件头设计说明）。
   */
  gitSnapshot?: GitSnapshot;
  gitBranches: GitBranchSummary[];
  gitStashRestored?: boolean;

  setGitBranches: (branches: GitBranchSummary[]) => void;
  setGitStashRestored: (restored: boolean) => void;
}

export const createGitSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): GitSlice => ({
  gitBranches: [],

  setGitBranches: (branches) => set({ gitBranches: branches }),
  setGitStashRestored: (restored) => set({ gitStashRestored: restored }),
});
