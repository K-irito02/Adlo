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
  batchExpandAll,
  expandSingle,
  createLazyLoader,
  clearError,
  captureError,
} from "../shared";
import type { StoreApi } from "zustand";

export function createWorkspaceActions(set: StoreApi<StoreState>["setState"], get: () => StoreState) {
  return {
    renameWorkspaceFile: async (relativePath: string, newName: string) => {
      clearError(get);
      const result = await window.digitalLife.workspace.renameFile(
        relativePath,
        newName
      );
      if (!result.ok) {
        captureError(get, result.error);
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
      clearError(get);
      const result = await window.digitalLife.workspace.deleteFile(relativePath);
      if (!result.ok) {
        captureError(get, result.error);
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
      clearError(get);
      const result = await window.digitalLife.workspace.moveFile(
        relativePath,
        newPath
      );
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      await get().refreshWorkspaceTree();
    },

    duplicateWorkspaceFile: async (srcRelativePath: string, dstRelativePath: string) => {
      clearError(get);
      const result = await window.digitalLife.workspace.duplicateFile(
        srcRelativePath,
        dstRelativePath
      );
      if (!result.ok) {
        captureError(get, result.error);
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
      clearError(get);
      const result = await window.digitalLife.workspace.open(workspacePath);
      if (requestSeq !== workspaceRequestSeq)
        return { ok: false, error: "Request superseded" };
      if (!result.ok) {
        captureError(get, result.error);
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
      clearError(get);
      const result = await window.digitalLife.workspace.clearCurrent();
      if (requestSeq !== workspaceRequestSeq) return;
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      await get().bootstrap();
    },

    pickWorkspaceDirectory: async () => {
      clearError(get);
      const result = await window.digitalLife.workspace.pickDirectory();
      if (!result.ok) {
        captureError(get, result.error);
        return undefined;
      }
      return result.data?.trim() || undefined;
    },

    pinWorkspace: async (workspaceId: string) => {
      clearError(get);
      const result = await window.digitalLife.workspace.pin(workspaceId);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      set({ recentWorkspaces: result.data });
    },

    unpinWorkspace: async (workspaceId: string) => {
      clearError(get);
      const result = await window.digitalLife.workspace.unpin(workspaceId);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      set({ recentWorkspaces: result.data });
    },

    removeWorkspaceFromSidebar: async (workspaceId: string) => {
      clearError(get);
      const result = await window.digitalLife.workspace.removeFromSidebar(
        workspaceId
      );
      if (!result.ok) {
        captureError(get, result.error);
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
      clearError(get);
      const result = await window.digitalLife.workspace.reorder(input);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      set({ recentWorkspaces: result.data });
    },

    revealWorkspaceInFileManager: async (workspacePath: string) => {
      clearError(get);
      const result = await window.digitalLife.workspace.revealInFileManager(
        workspacePath
      );
      if (!result.ok) captureError(get, result.error);
    },

    refreshWorkspaceTree: async () => {
      clearError(get);
      const result = await window.digitalLife.workspace.listTree();
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
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

    loadWorkspaceTree: createLazyLoader<WorkspaceTreeNode[]>(
      (path) => window.digitalLife.workspace.listTreeForWorkspace(path),
      (s, id) => ({ hasData: !!s.workspaceTrees[id], isLoading: !!s.workspaceTreeLoading[id] }),
      (g, id) => ({
        workspaceTreeLoading: { ...g().workspaceTreeLoading, [id]: true },
        workspaceTreeErrors: { ...g().workspaceTreeErrors, [id]: undefined },
      }),
      (g, id, data) => ({
        workspaceTrees: { ...g().workspaceTrees, [id]: data },
        workspaceTreeLoading: { ...g().workspaceTreeLoading, [id]: false },
      }),
      (g, id, message) => ({
        workspaceTreeLoading: { ...g().workspaceTreeLoading, [id]: false },
        workspaceTreeErrors: { ...g().workspaceTreeErrors, [id]: message },
      }),
    )(set, get),

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
      await expandSingle(
        state.workspaceTreeExpandedInFileNav,
        workspaceId,
        (next) => set({ workspaceTreeExpandedInFileNav: next }),
        !!state.workspaceTrees[workspaceId],
        () => get().loadWorkspaceTree(workspaceId, workspacePath),
      );
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
      clearError(get);
      const result = await window.digitalLife.workspace.hideFromRightPanels(workspaceId);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      set({ recentWorkspaces: result.data });
      get().cleanupRemovedWorkspaceTree(workspaceId);
    },

    showWorkspaceInRightPanels: async (workspaceId: string) => {
      clearError(get);
      const result = await window.digitalLife.workspace.showInRightPanels(workspaceId);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      set({ recentWorkspaces: result.data });
    },

    expandAllWorkspaceTreesInFileNav: async () => {
      const state = get();
      await batchExpandAll(
        state.recentWorkspaces,
        state.workspaceTreeExpandedInFileNav,
        (next) => set({ workspaceTreeExpandedInFileNav: next }),
        (entry) => get().loadWorkspaceTree(entry.id, entry.path),
        (id) => !!state.workspaceTrees[id],
      );
    },

    collapseAllWorkspaceTreesInFileNav: () => {
      set({ workspaceTreeExpandedInFileNav: {} });
    },
  };
}
