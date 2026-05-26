import type { StoreState } from "../StoreState";
import type {
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
} from "@ai-digital-life/kernel";
import type { StoreApi } from "zustand";

async function refreshAfterBranchChange(get: () => StoreState) {
  await Promise.allSettled([
    get().refreshWorkspaceTree(),
    get().fetchIndexStatus(),
    get().fetchRepoMap(),
    get().fetchGitStatus(),
    get().fetchGitBranches(),
  ]);
  if (get().selectedFilePath) await get().openFile(get().selectedFilePath!);
}

export function createGitActions(set: StoreApi<StoreState>["setState"], get: () => StoreState) {
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
      const result = await window.digitalLife.workspace.switchGitBranch(input);
      if (!result.ok) {
        set({ error: result.error.message });
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
        workspaceContextMode: "workspace" as const,
      }));
      await refreshAfterBranchChange(get);
    },

    createGitBranch: async (input: WorkspaceGitBranchCreateInput) => {
      const result = await window.digitalLife.workspace.createGitBranch(input);
      if (!result.ok) {
        set({ error: result.error.message });
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
        workspaceContextMode: "workspace" as const,
      }));
      await refreshAfterBranchChange(get);
    },

    loadGitSnapshot: async (workspaceId: string, workspacePath: string) => {
      const state = get();
      if (state.gitSnapshots[workspaceId] && !state.workspaceChangesTreeLoading[workspaceId]) {
        return;
      }
      set({
        workspaceChangesTreeLoading: { ...state.workspaceChangesTreeLoading, [workspaceId]: true },
        workspaceChangesTreeErrors: { ...state.workspaceChangesTreeErrors, [workspaceId]: undefined },
      });
      const result = await window.digitalLife.workspace.listGitStatusForWorkspace(workspacePath);
      const loading = { ...get().workspaceChangesTreeLoading, [workspaceId]: false };
      if (!result.ok) {
        set({
          workspaceChangesTreeLoading: loading,
          workspaceChangesTreeErrors: { ...get().workspaceChangesTreeErrors, [workspaceId]: result.error.message },
        });
        return;
      }
      set({
        gitSnapshots: { ...get().gitSnapshots, [workspaceId]: result.data },
        workspaceChangesTreeLoading: loading,
      });
    },

    refreshGitSnapshot: async (workspaceId: string, workspacePath: string) => {
      set({
        workspaceChangesTreeLoading: { ...get().workspaceChangesTreeLoading, [workspaceId]: true },
        workspaceChangesTreeErrors: { ...get().workspaceChangesTreeErrors, [workspaceId]: undefined },
      });
      const result = await window.digitalLife.workspace.listGitStatusForWorkspace(workspacePath);
      const loading = { ...get().workspaceChangesTreeLoading, [workspaceId]: false };
      if (!result.ok) {
        set({
          workspaceChangesTreeLoading: loading,
          workspaceChangesTreeErrors: { ...get().workspaceChangesTreeErrors, [workspaceId]: result.error.message },
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
      if (state.workspaceChangesExpanded[workspaceId]) {
        set({
          workspaceChangesExpanded: {
            ...state.workspaceChangesExpanded,
            [workspaceId]: false,
          },
        });
        return;
      }
      set({
        workspaceChangesExpanded: {
          ...state.workspaceChangesExpanded,
          [workspaceId]: true,
        },
      });
      if (!state.gitSnapshots[workspaceId]) {
        await get().loadGitSnapshot(workspaceId, workspacePath);
      }
    },

    collapseAllWorkspaceChanges: () => {
      set({ workspaceChangesExpanded: {} });
    },

    expandAllWorkspaceChanges: async () => {
      const state = get();
      const visibleEntries = state.recentWorkspaces.filter(
        (w) => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available
      );
      const expandedAll: Record<string, boolean> = {};
      for (const entry of visibleEntries) {
        expandedAll[entry.id] = true;
      }
      set({ workspaceChangesExpanded: expandedAll });
      const toLoad = visibleEntries.filter((e) => !state.gitSnapshots[e.id]);
      const CONCURRENCY = 3;
      for (let i = 0; i < toLoad.length; i += CONCURRENCY) {
        const batch = toLoad.slice(i, i + CONCURRENCY);
        await Promise.allSettled(
          batch.map((entry) => get().loadGitSnapshot(entry.id, entry.path))
        );
      }
    },
  };
}
