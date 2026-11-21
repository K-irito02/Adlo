import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';
import { clearError, captureError, expandSingle, batchExpandAll } from '../shared';
import { applyGitOperation } from './gitSnapshotActions';
import { changesZh } from '../../i18n/zh-CN/changes';
import { changesEn } from '../../i18n/en-US/changes';
import { resolveAppLanguage } from '../../i18n/resolveLanguage';
const SCOPE = 'git';

function changesDict(get: () => StoreState) {
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

    pushWorkspaceChanges: async (
      workspacePath?: string,
      options?: { ahead?: number; hasUpstream?: boolean },
    ): Promise<boolean> => {
      const target = resolveWorkspaceTarget(get(), workspacePath);
      if (!target) {
        return false;
      }
      // 同一工作区只允许一个远端操作在跑：菜单、行内按钮、错误卡「重试」共享此守卫。
      if (get().gitOpsBusy[target.id]) {
        return false;
      }
      get().setGitOpsBusy(target.id, 'push');
      try {
        clearError(get, SCOPE);
        const result = await window.digitalLife.workspace.pushChanges(target.path);
        if (!result.ok) {
          const dict = changesDict(get);
          get().reportError(result.error.code, result.error.message, `git:push:${target.id}`, {
            level: 'error',
            actions: [
              {
                label: dict.changesPushRetry,
                // 重试前重读 ahead/upstream：失败到重试之间本地/远端可能已变化，
                // 复用失败时捕获的旧值会让「已推送 N 个提交」显示过期数字。
                run: async () => {
                  const fresh = await readPushOptions(target.path);
                  return get().pushWorkspaceChanges(target.path, fresh ?? { hasUpstream: false });
                },
              },
            ],
          });
          return false;
        }
        await refreshWorkspaceSnapshot(get, target);
        // 成功后清掉该工作区此前残留的推送失败卡（与失败上报使用同一 scope）。
        get().clearErrorToasts(`git:push:${target.id}`);
        const dict = changesDict(get);
        const count = options?.ahead ?? 0;
        const hasUpstream = options?.hasUpstream ?? true;
        const message = !hasUpstream
          ? dict.changesPushSuccessGeneric
          : count > 0
            ? fill(dict.changesPushSuccess, { count })
            : dict.changesPushUpToDate;
        get().showToast(message, 'success');
        return true;
      } finally {
        get().setGitOpsBusy(target.id, null);
      }
    },

    pullWorkspaceChanges: async (workspacePath?: string): Promise<boolean> => {
      const target = resolveWorkspaceTarget(get(), workspacePath);
      if (!target) {
        return false;
      }
      if (get().gitOpsBusy[target.id]) {
        return false;
      }
      get().setGitOpsBusy(target.id, 'pull');
      try {
        clearError(get, SCOPE);
        const result = await window.digitalLife.workspace.pullChanges(target.path);
        if (!result.ok) {
          const dict = changesDict(get);
          get().reportError(result.error.code, result.error.message, `git:pull:${target.id}`, {
            level: 'error',
            actions: [
              {
                label: dict.changesPullRetry,
                run: () => get().pullWorkspaceChanges(target.path),
              },
            ],
          });
          return false;
        }
        await refreshWorkspaceSnapshot(get, target);
        get().clearErrorToasts(`git:pull:${target.id}`);
        get().showToast(changesDict(get).changesPullSuccess, 'success');
        return true;
      } finally {
        get().setGitOpsBusy(target.id, null);
      }
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

/**
 * 重试推送前读取当前分支的 ahead / upstream。
 * 读取失败时返回 undefined —— 调用方降级为无 upstream 的通用成功文案，
 * 避免把「已是最新」这类依赖旧数字的结论展示给用户。
 */
async function readPushOptions(
  path: string,
): Promise<{ ahead: number; hasUpstream: boolean } | undefined> {
  const branches = await window.digitalLife.workspace.listGitBranches(path);
  if (!branches.ok) {
    return undefined;
  }
  const current = branches.data.find((branch) => branch.isCurrent);
  return { ahead: current?.ahead ?? 0, hasUpstream: Boolean(current?.upstream) };
}
