import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';
import { clearError, captureError, expandSingle, batchExpandAll } from '../shared';
import { applyGitOperation } from './gitSnapshotActions';
const SCOPE = 'git';

export function createGitFileOpsActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
) {
  return {
    /**
     * [expandWorkspaceChangesInFileNav - 展开文件导航中工作区的变更列表]
     * @reads gitSlice.workspaceChangesExpanded, gitSlice.gitSnapshots
     * @writes gitSlice.workspaceChangesExpanded, gitSlice.gitSnapshots (通过 loadGitSnapshot)
     * @see shared/ipc.ts → workspace.listGitStatusForWorkspace (通过 loadGitSnapshot)
     * @see mock-bridge.ts → workspace.listGitStatusForWorkspace (通过 loadGitSnapshot)
     * @see preview-bridge/index.ts → workspace.listGitStatusForWorkspace (通过 loadGitSnapshot)
     */
    expandWorkspaceChangesInFileNav: async (workspaceId: string, workspacePath: string) => {
      const state = get();
      await expandSingle(
        state.workspaceChangesExpanded,
        workspaceId,
        (next) => get().setWorkspaceChangesExpanded(next),
        !!state.gitSnapshots[workspaceId],
        () => get().loadGitSnapshot(workspaceId, workspacePath),
      );
    },

    /**
     * [collapseAllWorkspaceChanges - 折叠所有工作区的变更列表]
     * @reads — 无
     * @writes gitSlice.workspaceChangesExpanded
     * @see — 无桥接调用
     */
    collapseAllWorkspaceChanges: () => {
      get().setWorkspaceChangesExpanded({});
    },

    /**
     * [expandAllWorkspaceChanges - 展开文件导航中所有工作区的变更列表]
     * @reads workspaceSlice.recentWorkspaces, gitSlice.workspaceChangesExpanded, gitSlice.gitSnapshots
     * @writes gitSlice.workspaceChangesExpanded, gitSlice.gitSnapshots (通过 loadGitSnapshot)
     * @see shared/ipc.ts → workspace.listGitStatusForWorkspace (通过 loadGitSnapshot)
     * @see mock-bridge.ts → workspace.listGitStatusForWorkspace (通过 loadGitSnapshot)
     * @see preview-bridge/index.ts → workspace.listGitStatusForWorkspace (通过 loadGitSnapshot)
     */
    expandAllWorkspaceChanges: async () => {
      const state = get();
      await batchExpandAll(
        state.recentWorkspaces,
        state.workspaceChangesExpanded,
        (next) => get().setWorkspaceChangesExpanded(next),
        (entry) => get().loadGitSnapshot(entry.id, entry.path),
        (id) => !!state.gitSnapshots[id],
      );
    },

    stageWorkspaceFile: async (relativePath: string, workspacePath?: string) => {
      clearError(get, SCOPE);
      const path =
        workspacePath ??
        get().appInfo?.currentWorkspace?.rootPath ??
        get().appInfo?.currentWorkspace?.path;
      const result = await window.digitalLife.workspace.stageFile(relativePath, path);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      applyGitOperation(get, set, path, relativePath, 'stage');
    },

    unstageWorkspaceFile: async (relativePath: string, workspacePath?: string) => {
      clearError(get, SCOPE);
      const path =
        workspacePath ??
        get().appInfo?.currentWorkspace?.rootPath ??
        get().appInfo?.currentWorkspace?.path;
      const result = await window.digitalLife.workspace.unstageFile(relativePath, path);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      applyGitOperation(get, set, path, relativePath, 'unstage');
    },

    discardWorkspaceFile: async (relativePath: string, workspacePath?: string) => {
      clearError(get, SCOPE);
      const path =
        workspacePath ??
        get().appInfo?.currentWorkspace?.rootPath ??
        get().appInfo?.currentWorkspace?.path;
      const result = await window.digitalLife.workspace.discardFile(relativePath, path);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      applyGitOperation(get, set, path, relativePath, 'discard');
    },

    stageAllWorkspaceChanges: async (workspacePath?: string) => {
      clearError(get, SCOPE);
      const target = resolveWorkspaceTarget(get(), workspacePath);
      if (!target) {
        return;
      }
      const result = await window.digitalLife.workspace.stageAllFiles(target.path);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      await refreshWorkspaceSnapshot(get, target);
    },

    unstageAllWorkspaceChanges: async (workspacePath?: string) => {
      clearError(get, SCOPE);
      const target = resolveWorkspaceTarget(get(), workspacePath);
      if (!target) {
        return;
      }
      const result = await window.digitalLife.workspace.unstageAllFiles(target.path);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      await refreshWorkspaceSnapshot(get, target);
    },

    discardAllWorkspaceChanges: async (workspacePath?: string) => {
      clearError(get, SCOPE);
      const target = resolveWorkspaceTarget(get(), workspacePath);
      if (!target) {
        return;
      }
      const result = await window.digitalLife.workspace.discardAllFiles(target.path);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      await refreshWorkspaceSnapshot(get, target);
    },

    commitWorkspaceChanges: async (
      message: string,
      options?: { stageAll?: boolean; workspacePath?: string },
    ) => {
      clearError(get, SCOPE);
      const target = resolveWorkspaceTarget(get(), options?.workspacePath);
      if (!target) {
        return 'no workspace selected';
      }
      if (options?.stageAll) {
        const staged = await window.digitalLife.workspace.stageAllFiles(target.path);
        if (!staged.ok) {
          captureError(get, staged.error, SCOPE);
          return staged.error.message;
        }
      }
      const result = await window.digitalLife.workspace.commitChanges(message, target.path);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return result.error.message;
      }
      await refreshWorkspaceSnapshot(get, target);
      return undefined;
    },

    pushWorkspaceChanges: async (workspacePath?: string) => {
      clearError(get, SCOPE);
      const target = resolveWorkspaceTarget(get(), workspacePath);
      if (!target) {
        return;
      }
      const result = await window.digitalLife.workspace.pushChanges(target.path);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      await refreshWorkspaceSnapshot(get, target);
    },

    pullWorkspaceChanges: async (workspacePath?: string) => {
      clearError(get, SCOPE);
      const target = resolveWorkspaceTarget(get(), workspacePath);
      if (!target) {
        return;
      }
      const result = await window.digitalLife.workspace.pullChanges(target.path);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      await refreshWorkspaceSnapshot(get, target);
    },
  };
}

interface WorkspaceTarget {
  id: string;
  path: string;
}

/** 解析目标任务：显式 path → 最近工作区条目；缺失则回退当前工作区。 */
function resolveWorkspaceTarget(state: StoreState, workspacePath?: string): WorkspaceTarget | null {
  const path =
    workspacePath ??
    state.appInfo?.currentWorkspace?.rootPath ??
    state.appInfo?.currentWorkspace?.path;
  if (!path) {
    return null;
  }
  const entry = state.recentWorkspaces.find(
    (workspace) => workspace.path === path || workspace.rootPath === path,
  );
  const id = entry?.id ?? state.appInfo?.currentWorkspace?.id;
  return id ? { id, path } : null;
}

/** 操作成功后强制重读快照（懒加载器在已有数据时会直接 return，不能用于强制刷新）。 */
async function refreshWorkspaceSnapshot(
  get: () => StoreState,
  target: WorkspaceTarget,
): Promise<void> {
  await get().refreshGitSnapshot(target.id, target.path, { silent: true });
}
