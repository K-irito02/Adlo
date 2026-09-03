import type { StoreState } from '../StoreState';
import type {
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
} from '@ai-digital-life/kernel';
import type { StoreApi } from 'zustand';
import { clearError, captureError, postMutationRefresh } from '../shared';
const SCOPE = 'git';

async function refreshAfterBranchChange(get: () => StoreState) {
  await postMutationRefresh(get);
  if (get().selectedFilePath) {
    await get().openFile(get().selectedFilePath!);
  }
}

export function createGitBranchActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
) {
  return {
    /**
     * [fetchGitBranches - 获取 Git 分支列表]
     * @reads workspaceSlice.appInfo
     * @writes gitSlice.gitBranches
     * @see shared/ipc.ts → workspace.listGitBranches
     * @see mock-bridge.ts → workspace.listGitBranches
     * @see preview-bridge/index.ts → workspace.listGitBranches
     */
    fetchGitBranches: async () => {
      if (!get().appInfo?.currentWorkspace) {
        set({ gitBranches: [] });
        return;
      }
      const result = await window.digitalLife.workspace.listGitBranches();
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        set({ gitBranches: [] });
        return;
      }
      clearError(get, SCOPE);
      set({ gitBranches: result.data });
    },

    /**
     * [switchGitBranch - 切换 Git 分支]
     * @writes workspaceSlice.appInfo, gitSlice.gitSnapshot
     * @see shared/ipc.ts → workspace.switchGitBranch
     * @see mock-bridge.ts → workspace.switchGitBranch
     * @see preview-bridge/index.ts → workspace.switchGitBranch
     */
    switchGitBranch: async (input: WorkspaceGitBranchSwitchInput) => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.workspace.switchGitBranch(input);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      const { hasRestored, gitSnapshot, previousBranch, currentBranch } = result.data;
      set((state: StoreState) => ({
        appInfo: state.appInfo
          ? {
              ...state.appInfo,
              currentWorkspace: result.data.workspace,
            }
          : state.appInfo,
        gitSnapshot: gitSnapshot,
        gitStashRestored: hasRestored,
      }));
      if (!hasRestored && gitSnapshot.conflicts.length > 0) {
        const summary = `检测到 ${gitSnapshot.conflicts.length} 个文件的合并冲突`;
        const fullInfo = [
          `冲突操作: Stash pop 恢复暂存变更`,
          `从分支: ${previousBranch ?? 'unknown'}`,
          `切换到: ${currentBranch}`,
          `发生时间: ${new Date().toISOString()}`,
          `冲突文件:`,
          ...gitSnapshot.conflicts.map((f) => `  - ${f}`),
        ].join('\n');
        get().addNotification({
          type: 'conflict',
          title: '合并冲突',
          summary,
          fullInfo,
        });
      }
      await refreshAfterBranchChange(get);
    },

    /**
     * [createGitBranch - 创建并切换到新 Git 分支]
     * @writes workspaceSlice.appInfo, gitSlice.gitSnapshot
     * @see shared/ipc.ts → workspace.createGitBranch
     * @see mock-bridge.ts → workspace.createGitBranch
     * @see preview-bridge/index.ts → workspace.createGitBranch
     */
    createGitBranch: async (input: WorkspaceGitBranchCreateInput) => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.workspace.createGitBranch(input);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      set((state: StoreState) => ({
        appInfo: state.appInfo
          ? {
              ...state.appInfo,
              currentWorkspace: result.data.workspace,
            }
          : state.appInfo,
        gitSnapshot: result.data.gitSnapshot,
      }));
      await refreshAfterBranchChange(get);
    },
  };
}
