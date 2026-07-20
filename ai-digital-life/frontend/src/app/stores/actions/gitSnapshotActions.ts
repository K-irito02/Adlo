import type { StoreState } from '../StoreState';
import type { GitSnapshot } from '@ai-digital-life/kernel';
import type { StoreApi } from 'zustand';
import { createLazyLoader } from '../shared';

function moveInSnapshot(
  snapshot: GitSnapshot,
  relativePath: string,
  operation: 'stage' | 'unstage' | 'discard',
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

export function applyGitOperation(
  get: () => StoreState,
  set: StoreApi<StoreState>['setState'],
  workspacePath: string | undefined,
  relativePath: string,
  operation: 'stage' | 'unstage' | 'discard',
) {
  const state = get();
  const patches: Partial<StoreState> = {};
  if (state.gitSnapshot) {
    patches.gitSnapshot = moveInSnapshot(state.gitSnapshot, relativePath, operation);
  }
  if (workspacePath) {
    const ws = state.recentWorkspaces.find(
      (w) => w.path === workspacePath || w.rootPath === workspacePath,
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

export function createGitSnapshotActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
) {
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
      }),
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
  };
}
