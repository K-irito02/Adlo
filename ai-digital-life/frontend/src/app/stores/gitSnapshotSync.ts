import type { StoreState } from './StoreState';
import type { GitSnapshot, WorkspaceMeta } from '@ai-digital-life/kernel';

/**
 * Git 快照三源同步补丁构造器
 *
 * Git 快照在 store 中冗余存储于三处，各有用途：
 * - Source A (gitSlice.gitSnapshot)：当前工作区单例，右侧 Changes 面板 / badge 快速访问
 * - Source B (workspaceSlice.gitSnapshots)：所有工作区快照，多工作区视图（文件树/变更树/Git 可视化）按工作区 ID 读取
 * - Source C (workspaceSlice.appInfo.currentWorkspace.gitSnapshot)：后端 metadata 兜底（badge/header）
 *
 * 本函数把一个工作区的最新快照一次性写入三源，保证「双向同步」不变量成立：
 * - B 恒写入 `gitSnapshots[workspaceId]`（合并写，不清空其它槽位）
 * - 仅当 workspaceId === 当前工作区 id 时，才同步写 A 与 C（A/C 语义就是「当前工作区」）
 *
 * @param state 最新 store 状态（setState 函数式回调中传入）
 * @param opts.workspaceId 快照所属工作区的权威 id（来自后端响应时以响应为准）
 * @param opts.snapshot 该工作区的最新快照
 * @param opts.workspaceMeta 可选：后端返回的最新工作区元数据（switch/create 等会整体更新
 *                           currentWorkspace 的 updatedAt 等字段）。提供时 C 以其为基底，
 *                           并强制 gitSnapshot 字段为本次权威快照；缺省时仅更新
 *                           currentWorkspace.gitSnapshot 字段，保留其它元数据不变。
 * @returns 可并入 setState 的 Partial<StoreState>
 */
export function buildGitSnapshotSyncPatch(
  state: StoreState,
  opts: { workspaceId: string; snapshot: GitSnapshot; workspaceMeta?: WorkspaceMeta },
): Partial<StoreState> {
  const { workspaceId, snapshot, workspaceMeta } = opts;
  const patch: Partial<StoreState> = {
    gitSnapshots: { ...state.gitSnapshots, [workspaceId]: snapshot },
  };

  // Mark this workspace's cached git-visualization data stale when the commit
  // HEAD or branch changes (new commit / branch switch). The cached data is
  // kept so the charts keep rendering until fresh data lands (no empty flash);
  // the visualization's auto-refresh guard re-fetches while stale, and writing
  // fresh data clears the flag. Plain file edits (only staged/unstaged/untracked
  // change) leave the cache fresh, so re-navigation stays flash-free.
  const prev = state.gitSnapshots[workspaceId];
  if (prev && (prev.branch !== snapshot.branch || prev.head !== snapshot.head)) {
    patch.gitVisStale = { ...(state.gitVisStale ?? {}), [workspaceId]: true };
  }

  const currentWorkspace = state.appInfo?.currentWorkspace;
  if (!currentWorkspace || currentWorkspace.id !== workspaceId) {
    return patch;
  }
  patch.gitSnapshot = snapshot;
  if (state.appInfo) {
    patch.appInfo = {
      ...state.appInfo,
      currentWorkspace: {
        ...(workspaceMeta ?? currentWorkspace),
        gitSnapshot: snapshot,
      },
    };
  }
  return patch;
}
