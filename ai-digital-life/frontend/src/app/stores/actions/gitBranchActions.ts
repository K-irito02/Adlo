import type { StoreState } from '../StoreState';
import type {
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
  WorkspaceWorktreeEnsureInput,
  WorkspaceWorktreeRemoveInput,
} from '@ai-digital-life/kernel';
import type { StoreApi } from 'zustand';
import type { GitSnapshot } from '@ai-digital-life/kernel';
import { clearError, captureError, postMutationRefresh, clearWorkspaceCaches } from '../shared';
import { asWorkspaceID } from '../../../shared/branded';
import { buildGitSnapshotSyncPatch } from '../gitSnapshotSync';
// Store 侧提示文案取静态语言包（与 generalActions sessionOverrideNotice 同模式，不走 hook）。
import { changesZh } from '../../i18n/zh-CN/changes';
import { changesEn } from '../../i18n/en-US/changes';
import { resolveAppLanguage } from '../../i18n/resolveLanguage';
const SCOPE = 'git';

function branchDict(get: () => StoreState) {
  const locale = resolveAppLanguage(get().appInfo?.config?.language);
  return locale === 'en-US' ? changesEn : changesZh;
}

function fill(template: string, vars: Record<string, string | number>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(`{${key}}`, String(value));
  }
  return out;
}

function sameFsPath(left?: string, right?: string): boolean {
  if (!left || !right) {
    return false;
  }
  const norm = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return norm(left) === norm(right);
}

function dirtyChangeCount(snapshot?: GitSnapshot): number {
  if (!snapshot) {
    return 0;
  }
  return snapshot.staged.length + snapshot.unstaged.length + snapshot.untracked.length;
}

/** 预期态判定：非 Git 工作区的 git 命令失败是正常行为，不应打扰用户。 */
function isExpectedNonGitError(error: unknown): boolean {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : '';
  return message.toLowerCase().includes('not a git repository');
}

async function refreshAfterBranchChange(get: () => StoreState) {
  // 双面板联动：git 快照（变更面板）+ 文件树（文件面板）+ 分支列表（子卡片）
  // 同刷，任一入口切换后两处都变化。文件文档缓存按工作区整清（旧分支内容
  // 不得复活），再对账选中文件（绕过缓存重读；文件在新分支不存在则清为空状态）。
  await postMutationRefresh(get);
  await get().fetchGitBranches({ silent: true });
  const currentWorkspace = get().appInfo?.currentWorkspace;
  if (currentWorkspace) {
    clearWorkspaceCaches(currentWorkspace.id);
    await get().refreshOneWorkspaceTree(asWorkspaceID(currentWorkspace.id), currentWorkspace.path, {
      silent: true,
    });
  }
  await get().reconcileSelectedFile();
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
        // 非 Git 是预期态：永不打扰。silent（启动级联）下真实故障记静默诊断，
        // 不弹卡片但可从 errorToasts 排查（Phase 4 审查 S3）。
        if (isExpectedNonGitError(result.error)) {
          set({ gitBranches: [] });
          return;
        }
        if (options?.silent) {
          get().reportSilentError(result.error.code, result.error.message, SCOPE);
        } else {
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
      // 切分支前落盘脏缓冲（自动保存语义），再 stash/切换。
      await get().saveDirtyEditors();
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
    /**
     * [ensureBranchWorktree - 确保分支 worktree 并聚焦]
     * worktree 隔离切换：同目录 `git switch` 重写 vs 换目录聚焦（零重写）。
     * 聚焦走 `openWorkspace` → `bootstrap`，文件面板（树）+ 变更面板（快照）
     * 同刷，满足“任一面板切换、两处都变”。
     */
    ensureBranchWorktree: async (input: WorkspaceWorktreeEnsureInput, workspacePath?: string) => {
      clearError(get, SCOPE);
      const branchName = input.branchName.trim();
      const dict = branchDict(get);
      const sourceWs =
        (get().recentWorkspaces ?? []).find((entry) =>
          sameFsPath(entry.path, workspacePath ?? get().appInfo?.currentWorkspace?.path),
        ) ?? get().appInfo?.currentWorkspace;
      const rootPath = workspacePath ?? get().appInfo?.currentWorkspace?.path;
      // 离开前的脏状态（事项 6）：只对“当前正在看的”工作区可知，跨工作区菜单不断言。
      const actingOnCurrent =
        !!get().appInfo?.currentWorkspace &&
        sameFsPath(sourceWs?.path, get().appInfo?.currentWorkspace?.path);
      const sourceBranch = actingOnCurrent ? (get().gitSnapshot?.branch ?? '') : '';
      const sourceDirty = actingOnCurrent ? dirtyChangeCount(get().gitSnapshot) : 0;

      // 边界（事项 5）：目标 worktree 已在列表（用户手动添加过）→ 不跑任何 git
      // 切换，只聚焦显示 + toast 说明。
      const listed = await window.digitalLife.workspace.listWorktrees(rootPath);
      const existingPath = listed.ok
        ? listed.data.find((entry) => entry.branch === branchName)?.path
        : undefined;
      const registered = (get().recentWorkspaces ?? []).find(
        (entry) =>
          !entry.removedFromSidebar && entry.available && sameFsPath(entry.path, existingPath),
      );
      let targetPath: string | undefined;
      if (registered) {
        if (sourceWs && sameFsPath(registered.path, sourceWs.path)) {
          get().showToast(fill(dict.changesBranchAlreadyAdded, { branch: branchName }), 'success');
          return registered.path;
        }
        get().showToast(fill(dict.changesBranchAlreadyAdded, { branch: branchName }), 'success');
        await get().openWorkspace(registered.path);
        targetPath = registered.path;
      } else {
        const result = await window.digitalLife.workspace.ensureWorktree(input, rootPath);
        if (!result.ok) {
          captureError(get, result.error, SCOPE);
          return undefined;
        }
        await get().openWorkspace(result.data.path);
        targetPath = result.data.path;
      }
      // 替换式（事项 5）：移出源工作区（目标已聚焦，不触发 clearWorkspaceContext），
      // 列表里永远只留一个分支工作区；缓存随移除清理，重返时重扫保证准确。
      if (sourceWs && !sameFsPath(sourceWs.path, targetPath)) {
        const sourceEntry = (get().recentWorkspaces ?? []).find((entry) =>
          sameFsPath(entry.path, sourceWs.path),
        );
        if (sourceEntry) {
          await get().removeWorkspaceFromSidebar(asWorkspaceID(sourceEntry.id));
        }
        get().showToast(fill(dict.changesBranchReplaced, { branch: branchName }), 'success');
      }
      // 脏保留提醒（事项 6）：只提示，不自动 push；分叉由行图标 + 同步选项解决。
      if (sourceDirty > 0 && sourceBranch) {
        get().showToast(
          fill(dict.changesBranchDirtyKept, { branch: sourceBranch, count: sourceDirty }),
          'warning',
        );
      }
      return targetPath;
    },

    removeBranchWorktree: async (input: WorkspaceWorktreeRemoveInput, workspacePath?: string) => {
      clearError(get, SCOPE);
      const rootPath = workspacePath ?? get().appInfo?.currentWorkspace?.path;
      const result = await window.digitalLife.workspace.removeWorktree(input, rootPath);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      await get().fetchGitBranches({ silent: true });
    },

    pruneWorktrees: async (workspacePath?: string) => {
      clearError(get, SCOPE);
      const rootPath = workspacePath ?? get().appInfo?.currentWorkspace?.path;
      const result = await window.digitalLife.workspace.pruneWorktrees(rootPath);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
      }
    },

    createGitBranch: async (input: WorkspaceGitBranchCreateInput) => {
      clearError(get, SCOPE);
      await get().saveDirtyEditors();
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
