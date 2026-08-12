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
        (next) => set({ workspaceChangesExpanded: next }),
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
      set({ workspaceChangesExpanded: {} });
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
        (next) => set({ workspaceChangesExpanded: next }),
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
  };
}
