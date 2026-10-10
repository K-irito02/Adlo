import type { StoreState } from '../StoreState';
import type {
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
} from '@ai-digital-life/kernel';
import type { StoreApi } from 'zustand';
import { clearError, captureError, postMutationRefresh } from '../shared';
import { buildGitSnapshotSyncPatch } from '../gitSnapshotSync';
const SCOPE = 'git';

/** 预期态判定：非 Git 工作区的 git 命令失败是正常行为，不应打扰用户。 */
function isExpectedNonGitError(error: unknown): boolean {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : '';
  return message.toLowerCase().includes('not a git repository');
}

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
     * 非 Git 工作区没有分支是预期态（用户主动添加的非 Git 工作区很常见），
     * 此时只清空列表、不弹全局提示；silent（启动级联）则所有失败都不打扰。
     */
    fetchGitBranches: async (options?: { silent?: boolean }) => {
      if (!get().appInfo?.currentWorkspace) {
        set({ gitBranches: [] });
        return;
      }
      const result = await window.digitalLife.workspace.listGitBranches();
      if (!result.ok) {
        if (!options?.silent && !isExpectedNonGitError(result.error)) {
          captureError(get, result.error, SCOPE);
        }
        set({ gitBranches: [] });
        return;
      }
      clearError(get, SCOPE);
      set({ gitBranches: result.data });
    },

    /**
     * [switchGitBranch - 切换 Git 分支]
     * @writes workspaceSlice.appInfo, gitSlice.gitSnapshot, workspaceSlice.gitSnapshots (经 buildGitSnapshotSyncPatch)
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
        // result.data.workspace.id is the authoritative workspace id — the backend
        // branch operation always targets the current_workspace it operated on,
        // whereas reading currentWorkspace.id after the await races a mid-flight
        // workspace switch. Passing workspaceMeta also refreshes C via the sync helper.
        ...buildGitSnapshotSyncPatch(state, {
          workspaceId: result.data.workspace.id,
          snapshot: gitSnapshot,
          workspaceMeta: result.data.workspace,
        }),
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
     * @writes workspaceSlice.appInfo, gitSlice.gitSnapshot, workspaceSlice.gitSnapshots (经 buildGitSnapshotSyncPatch)
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
        // Authoritative workspace id comes from the backend response (see switchGitBranch).
        ...buildGitSnapshotSyncPatch(state, {
          workspaceId: result.data.workspace.id,
          snapshot: result.data.gitSnapshot,
          workspaceMeta: result.data.workspace,
        }),
      }));
      await refreshAfterBranchChange(get);
    },
  };
}
