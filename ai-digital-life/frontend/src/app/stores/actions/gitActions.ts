import type { StoreState } from "../StoreState";
import type {
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
} from "@ai-digital-life/kernel";
import type { StoreApi } from "zustand";

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
      await Promise.allSettled([
        get().refreshWorkspaceTree(),
        get().fetchIndexStatus(),
        get().fetchRepoMap(),
        get().fetchGitStatus(),
        get().fetchGitBranches(),
      ]);
      if (get().selectedFilePath) await get().openFile(get().selectedFilePath!);
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
      await Promise.allSettled([
        get().refreshWorkspaceTree(),
        get().fetchIndexStatus(),
        get().fetchRepoMap(),
        get().fetchGitStatus(),
        get().fetchGitBranches(),
      ]);
      if (get().selectedFilePath) await get().openFile(get().selectedFilePath!);
    },
  };
}
