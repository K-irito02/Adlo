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
  if (get().selectedFilePath) await get().openFile(get().selectedFilePath!);
}

export function createGitActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  return {
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
        if (!selectedChangePreviewPath) return;
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

    switchGitBranch: async (input: WorkspaceGitBranchSwitchInput) => {
      clearError(get);
      const result = await window.digitalLife.workspace.switchGitBranch(input);
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

    collapseAllWorkspaceChanges: () => {
      set({ workspaceChangesExpanded: {} });
    },

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
  };
}
