import type { StoreState } from "../StoreState";
import type { ReorderWorkspacesInput, WorkspaceTreeNode } from "@ai-digital-life/kernel";
import {
  getWorkspaceCachePrefix,
  getNextWorkspaceRequestSeq,
  getNextFileRequestSeq,
  getNextChangePreviewRequestSeq,
  getNextSessionRequestSeq,
  clearWorkspaceCaches,
  workspaceRequestSeq,
} from "../shared";
import type { StoreApi } from "zustand";

export function createWorkspaceActions(set: StoreApi<StoreState>["setState"], get: () => StoreState) {
  return {
    renameWorkspaceFile: async (relativePath: string, newName: string) => {
      const result = await window.digitalLife.workspace.renameFile(
        relativePath,
        newName
      );
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      await get().refreshWorkspaceTree();
      const currentPath = get().selectedFilePath;
      if (currentPath) {
        const parts = currentPath.split("/");
        parts[parts.length - 1] = newName;
        const newPath = parts.join("/");
        if (currentPath === relativePath) {
          await get().openFile(newPath);
        }
      }
    },

    deleteWorkspaceFile: async (relativePath: string) => {
      const result = await window.digitalLife.workspace.deleteFile(relativePath);
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      await get().refreshWorkspaceTree();
      const currentPath = get().selectedFilePath;
      if (currentPath === relativePath) {
        set({
          selectedFilePath: undefined,
          fileContent: undefined,
          openTabs: get().openTabs.filter((t) => t.path !== relativePath),
        });
      }
    },

    moveWorkspaceFile: async (relativePath: string, newPath: string) => {
      const result = await window.digitalLife.workspace.moveFile(
        relativePath,
        newPath
      );
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      await get().refreshWorkspaceTree();
    },

    duplicateWorkspaceFile: async (srcRelativePath: string, dstRelativePath: string) => {
      const result = await window.digitalLife.workspace.duplicateFile(
        srcRelativePath,
        dstRelativePath
      );
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      await get().refreshWorkspaceTree();
    },

    openWorkspace: async (workspacePath: string) => {
      const requestSeq = getNextWorkspaceRequestSeq();
      clearWorkspaceCaches(getWorkspaceCachePrefix(get().appInfo));
      getNextFileRequestSeq();
      getNextChangePreviewRequestSeq();
      getNextSessionRequestSeq();
      const result = await window.digitalLife.workspace.open(workspacePath);
      if (requestSeq !== workspaceRequestSeq)
        return { ok: false, error: "Request superseded" };
      if (!result.ok) {
        set({ error: result.error.message });
        return { ok: false, error: result.error.message };
      }
      await get().bootstrap();
      return { ok: true };
    },

    clearWorkspaceContext: async () => {
      const requestSeq = getNextWorkspaceRequestSeq();
      clearWorkspaceCaches(getWorkspaceCachePrefix(get().appInfo));
      getNextFileRequestSeq();
      getNextChangePreviewRequestSeq();
      getNextSessionRequestSeq();
      const result = await window.digitalLife.workspace.clearCurrent();
      if (requestSeq !== workspaceRequestSeq) return;
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      await get().bootstrap();
    },

    pickWorkspaceDirectory: async () => {
      const result = await window.digitalLife.workspace.pickDirectory();
      if (!result.ok) {
        set({ error: result.error.message });
        return undefined;
      }
      return result.data?.trim() || undefined;
    },

    pinWorkspace: async (workspaceId: string) => {
      const result = await window.digitalLife.workspace.pin(workspaceId);
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      set({ recentWorkspaces: result.data });
    },

    unpinWorkspace: async (workspaceId: string) => {
      const result = await window.digitalLife.workspace.unpin(workspaceId);
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      set({ recentWorkspaces: result.data });
    },

    removeWorkspaceFromSidebar: async (workspaceId: string) => {
      const result = await window.digitalLife.workspace.removeFromSidebar(
        workspaceId
      );
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      set({ recentWorkspaces: result.data });
      get().cleanupRemovedWorkspaceTree(workspaceId);
      const appInfo = get().appInfo;
      if (appInfo?.currentWorkspace?.id === workspaceId) {
        await get().clearWorkspaceContext();
      }
    },

    reorderWorkspaces: async (input: ReorderWorkspacesInput) => {
      const result = await window.digitalLife.workspace.reorder(input);
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      set({ recentWorkspaces: result.data });
    },

    revealWorkspaceInFileManager: async (workspacePath: string) => {
      const result = await window.digitalLife.workspace.revealInFileManager(
        workspacePath
      );
      if (!result.ok) set({ error: result.error.message });
    },

    refreshWorkspaceTree: async () => {
      const result = await window.digitalLife.workspace.listTree();
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      set({ error: undefined });
      const appInfo = get().appInfo;
      if (appInfo?.currentWorkspace?.id) {
        set({
          workspaceTrees: {
            ...get().workspaceTrees,
            [appInfo.currentWorkspace.id]: result.data,
          },
        });
      }
    },

    loadWorkspaceTree: async (workspaceId: string, workspacePath: string) => {
      const state = get();
      if (state.workspaceTrees[workspaceId] && !state.workspaceTreeLoading[workspaceId]) {
        return;
      }
      set({
        workspaceTreeLoading: { ...state.workspaceTreeLoading, [workspaceId]: true },
        workspaceTreeErrors: { ...state.workspaceTreeErrors, [workspaceId]: undefined },
      });
      const result = await window.digitalLife.workspace.listTreeForWorkspace(workspacePath);
      const loading = { ...get().workspaceTreeLoading, [workspaceId]: false };
      if (!result.ok) {
        set({
          workspaceTreeLoading: loading,
          workspaceTreeErrors: { ...get().workspaceTreeErrors, [workspaceId]: result.error.message },
        });
        return;
      }
      set({
        workspaceTrees: { ...get().workspaceTrees, [workspaceId]: result.data },
        workspaceTreeLoading: loading,
      });
    },

    toggleWorkspaceTreeInFileNav: (workspaceId: string) => {
      const current = get().workspaceTreeExpandedInFileNav;
      set({
        workspaceTreeExpandedInFileNav: {
          ...current,
          [workspaceId]: !current[workspaceId],
        },
      });
    },

    expandWorkspaceTreeInFileNav: async (workspaceId: string, workspacePath: string) => {
      const state = get();
      if (state.workspaceTreeExpandedInFileNav[workspaceId]) {
        set({
          workspaceTreeExpandedInFileNav: {
            ...state.workspaceTreeExpandedInFileNav,
            [workspaceId]: false,
          },
        });
        return;
      }
      set({
        workspaceTreeExpandedInFileNav: {
          ...state.workspaceTreeExpandedInFileNav,
          [workspaceId]: true,
        },
      });
      if (!state.workspaceTrees[workspaceId]) {
        await get().loadWorkspaceTree(workspaceId, workspacePath);
      }
    },

    refreshAllWorkspaceTrees: async () => {
      const state = get();
      const expandedIds = Object.entries(state.workspaceTreeExpandedInFileNav)
        .filter(([, expanded]) => expanded)
        .map(([id]) => id);
      await Promise.allSettled(
        expandedIds.map((id) => {
          const ws = state.recentWorkspaces.find((r) => r.id === id);
          if (!ws) return Promise.resolve();
          return get().loadWorkspaceTree(id, ws.path);
        })
      );
    },

    cleanupRemovedWorkspaceTree: (workspaceId: string) => {
      const state = get();
      const { [workspaceId]: _, ...restTrees } = state.workspaceTrees;
      const { [workspaceId]: __, ...restLoading } = state.workspaceTreeLoading;
      const { [workspaceId]: ___, ...restErrors } = state.workspaceTreeErrors;
      const { [workspaceId]: ____, ...restExpanded } = state.workspaceTreeExpandedInFileNav;
      set({
        workspaceTrees: restTrees,
        workspaceTreeLoading: restLoading,
        workspaceTreeErrors: restErrors,
        workspaceTreeExpandedInFileNav: restExpanded,
      });
    },

    hideWorkspaceFromRightPanels: async (workspaceId: string) => {
      const result = await window.digitalLife.workspace.hideFromRightPanels(workspaceId);
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      set({ recentWorkspaces: result.data });
      get().cleanupRemovedWorkspaceTree(workspaceId);
    },

    showWorkspaceInRightPanels: async (workspaceId: string) => {
      const result = await window.digitalLife.workspace.showInRightPanels(workspaceId);
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      set({ recentWorkspaces: result.data });
    },

    expandAllWorkspaceTreesInFileNav: async () => {
      const state = get();
      const visibleEntries = state.recentWorkspaces.filter(
        (w) => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available
      );
      const expandedAll: Record<string, boolean> = {};
      for (const entry of visibleEntries) {
        expandedAll[entry.id] = true;
      }
      set({ workspaceTreeExpandedInFileNav: expandedAll });
      const toLoad = visibleEntries.filter((e) => !state.workspaceTrees[e.id]);
      const CONCURRENCY = 3;
      for (let i = 0; i < toLoad.length; i += CONCURRENCY) {
        const batch = toLoad.slice(i, i + CONCURRENCY);
        await Promise.allSettled(
          batch.map((entry) => get().loadWorkspaceTree(entry.id, entry.path))
        );
      }
    },

    collapseAllWorkspaceTreesInFileNav: () => {
      set({ workspaceTreeExpandedInFileNav: {} });
    },
  };
}
