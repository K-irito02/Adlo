import type { StoreState } from '../StoreState';
import type {
  GitSnapshot,
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
} from '@ai-digital-life/kernel';
import type { StoreApi } from 'zustand';
import {
  postMutationRefresh,
  batchExpandAll,
  expandSingle,
  createLazyLoader,
  clearError,
  captureError,
} from '../shared';

async function refreshAfterBranchChange(get: () => StoreState) {
  await postMutationRefresh(get);
  if (get().selectedFilePath) {
    await get().openFile(get().selectedFilePath!);
  }
}

function moveInSnapshot(
  snapshot: GitSnapshot,
  relativePath: string,
  operation: 'stage' | 'unstage' | 'discard'
): GitSnapshot {
  const capturedAt = Date.now();
  if (operation === 'stage') {
    return {
      ...snapshot,
      staged: [...new Set([...snapshot.staged, relativePath])],
      unstaged: snapshot.unstaged.filter((p) => p !== relativePath),
      untracked: snapshot.untracked.filter((p) => p !== relativePath),
      capturedAt,
    };
  }
  if (operation === 'unstage') {
    return {
      ...snapshot,
      staged: snapshot.staged.filter((p) => p !== relativePath),
      unstaged: [...new Set([...snapshot.unstaged, relativePath])],
      capturedAt,
    };
  }
  return {
    ...snapshot,
    staged: snapshot.staged.filter((p) => p !== relativePath),
    unstaged: snapshot.unstaged.filter((p) => p !== relativePath),
    untracked: snapshot.untracked.filter((p) => p !== relativePath),
    capturedAt,
  };
}

function applyGitOperation(
  get: () => StoreState,
  set: StoreApi<StoreState>['setState'],
  workspacePath: string | undefined,
  relativePath: string,
  operation: 'stage' | 'unstage' | 'discard'
) {
  const state = get();
  const patches: Partial<StoreState> = {};
  if (state.gitSnapshot) {
    patches.gitSnapshot = moveInSnapshot(state.gitSnapshot, relativePath, operation);
  }
  if (workspacePath) {
    const ws = state.recentWorkspaces.find(
      (w) => w.path === workspacePath || w.rootPath === workspacePath
    );
    if (ws && state.gitSnapshots[ws.id]) {
      patches.gitSnapshots = {
        ...state.gitSnapshots,
        [ws.id]: moveInSnapshot(state.gitSnapshots[ws.id], relativePath, operation),
      };
    }
  }
  set(patches);
}

export function createGitActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  return {
    /**
     * [fetchGitStatus - 获取当前工作区的 Git 状态快照]
     * @reads workspaceSlice.appInfo, editorSlice.selectedChangePreviewPath
     * @writes gitSlice.gitSnapshot, workspaceSlice.appInfo (gitSnapshot 字段), editorSlice.selectedChangePreviewPath, editorSlice.changePreview, editorSlice.changePreviewLoading
     * @see shared/ipc.ts → workspace.getGitStatus
     * @see mock-bridge.ts → workspace.getGitStatus
     * @see preview-bridge/index.ts → workspace.getGitStatus
     */
    fetchGitStatus: async () => {
      if (!get().appInfo?.currentWorkspace) {
        set({
          gitSnapshot: undefined,
          selectedChangePreviewPath: undefined,
          changePreview: undefined,
          changePreviewLoading: false,
        });
        return;
      }
      const result = await window.digitalLife.workspace.getGitStatus();
      if (result.ok) {
        set((state: StoreState) => ({
          gitSnapshot: result.data,
          appInfo:
            state.appInfo && state.appInfo.currentWorkspace
              ? {
                  ...state.appInfo,
                  currentWorkspace: {
                    ...state.appInfo.currentWorkspace,
                    gitSnapshot: result.data,
                  },
                }
              : state.appInfo,
        }));
        const selectedChangePreviewPath = get().selectedChangePreviewPath;
        if (!selectedChangePreviewPath) {
          return;
        }
        const changedPaths = new Set([
          ...result.data.staged,
          ...result.data.unstaged,
          ...result.data.untracked,
          ...result.data.conflicts,
        ]);
        if (!changedPaths.has(selectedChangePreviewPath)) {
          set({
            selectedChangePreviewPath: undefined,
            changePreview: undefined,
            changePreviewLoading: false,
          });
          return;
        }
        await get().openChangePreview(selectedChangePreviewPath);
      }
    },

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
        set({ error: result.error.message, gitBranches: [] });
        return;
      }
      set({ error: undefined, gitBranches: result.data });
    },

    /**
     * [switchGitBranch - 切换 Git 分支]
     * @writes workspaceSlice.appInfo, gitSlice.gitSnapshot, workspaceSlice.workspaceContextMode
     * @see shared/ipc.ts → workspace.switchGitBranch
     * @see mock-bridge.ts → workspace.switchGitBranch
     * @see preview-bridge/index.ts → workspace.switchGitBranch
     */
    switchGitBranch: async (input: WorkspaceGitBranchSwitchInput) => {
      clearError(get);
      const result = await window.digitalLife.workspace.switchGitBranch(input);
      if (!result.ok) {
        captureError(get, result.error);
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
        workspaceContextMode: 'workspace' as const,
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
     * @writes workspaceSlice.appInfo, gitSlice.gitSnapshot, workspaceSlice.workspaceContextMode
     * @see shared/ipc.ts → workspace.createGitBranch
     * @see mock-bridge.ts → workspace.createGitBranch
     * @see preview-bridge/index.ts → workspace.createGitBranch
     */
    createGitBranch: async (input: WorkspaceGitBranchCreateInput) => {
      clearError(get);
      const result = await window.digitalLife.workspace.createGitBranch(input);
      if (!result.ok) {
        captureError(get, result.error);
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
        workspaceContextMode: 'workspace' as const,
      }));
      await refreshAfterBranchChange(get);
    },

    /**
     * [loadGitSnapshot - 懒加载指定工作区的 Git 状态快照]
     * @reads gitSlice.gitSnapshots, gitSlice.workspaceChangesTreeLoading
     * @writes gitSlice.gitSnapshots, gitSlice.workspaceChangesTreeLoading, gitSlice.workspaceChangesTreeErrors
     * @see shared/ipc.ts → workspace.listGitStatusForWorkspace
     * @see mock-bridge.ts → workspace.listGitStatusForWorkspace
     * @see preview-bridge/index.ts → workspace.listGitStatusForWorkspace
     */
    loadGitSnapshot: createLazyLoader<GitSnapshot>(
      (path) => window.digitalLife.workspace.listGitStatusForWorkspace(path),
      (s, id) => ({
        hasData: !!s.gitSnapshots[id],
        isLoading: !!s.workspaceChangesTreeLoading[id],
      }),
      (g, id) => ({
        workspaceChangesTreeLoading: { ...g().workspaceChangesTreeLoading, [id]: true },
        workspaceChangesTreeErrors: { ...g().workspaceChangesTreeErrors, [id]: undefined },
      }),
      (g, id, data) => ({
        gitSnapshots: { ...g().gitSnapshots, [id]: data },
        workspaceChangesTreeLoading: { ...g().workspaceChangesTreeLoading, [id]: false },
      }),
      (g, id, message) => ({
        workspaceChangesTreeLoading: { ...g().workspaceChangesTreeLoading, [id]: false },
        workspaceChangesTreeErrors: { ...g().workspaceChangesTreeErrors, [id]: message },
      })
    )(set, get),

    /**
     * [refreshGitSnapshot - 刷新单个工作区的 Git 状态快照]
     * @reads gitSlice.workspaceChangesTreeLoading, gitSlice.workspaceChangesTreeErrors
     * @writes gitSlice.gitSnapshots, gitSlice.workspaceChangesTreeLoading, gitSlice.workspaceChangesTreeErrors
     * @see shared/ipc.ts → workspace.listGitStatusForWorkspace
     * @see mock-bridge.ts → workspace.listGitStatusForWorkspace
     * @see preview-bridge/index.ts → workspace.listGitStatusForWorkspace
     */
    refreshGitSnapshot: async (workspaceId: string, workspacePath: string) => {
      set({
        workspaceChangesTreeLoading: { ...get().workspaceChangesTreeLoading, [workspaceId]: true },
        workspaceChangesTreeErrors: {
          ...get().workspaceChangesTreeErrors,
          [workspaceId]: undefined,
        },
      });
      const result = await window.digitalLife.workspace.listGitStatusForWorkspace(workspacePath);
      const loading = { ...get().workspaceChangesTreeLoading, [workspaceId]: false };
      if (!result.ok) {
        set({
          workspaceChangesTreeLoading: loading,
          workspaceChangesTreeErrors: {
            ...get().workspaceChangesTreeErrors,
            [workspaceId]: result.error.message,
          },
        });
        return;
      }
      set({
        gitSnapshots: { ...get().gitSnapshots, [workspaceId]: result.data },
        workspaceChangesTreeLoading: loading,
      });
    },

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
        () => get().loadGitSnapshot(workspaceId, workspacePath)
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
        (id) => !!state.gitSnapshots[id]
      );
    },

    stageWorkspaceFile: async (relativePath: string, workspacePath?: string) => {
      clearError(get);
      const path =
        workspacePath ??
        get().appInfo?.currentWorkspace?.rootPath ??
        get().appInfo?.currentWorkspace?.path;
      const result = await window.digitalLife.workspace.stageFile(relativePath, path);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      applyGitOperation(get, set, path, relativePath, 'stage');
    },

    unstageWorkspaceFile: async (relativePath: string, workspacePath?: string) => {
      clearError(get);
      const path =
        workspacePath ??
        get().appInfo?.currentWorkspace?.rootPath ??
        get().appInfo?.currentWorkspace?.path;
      const result = await window.digitalLife.workspace.unstageFile(relativePath, path);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      applyGitOperation(get, set, path, relativePath, 'unstage');
    },

    discardWorkspaceFile: async (relativePath: string, workspacePath?: string) => {
      clearError(get);
      const path =
        workspacePath ??
        get().appInfo?.currentWorkspace?.rootPath ??
        get().appInfo?.currentWorkspace?.path;
      const result = await window.digitalLife.workspace.discardFile(relativePath, path);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      applyGitOperation(get, set, path, relativePath, 'discard');
    },
  };
}
