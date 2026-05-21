import type { StoreState } from "../StoreState";
import type { ReorderWorkspacesInput } from "@ai-digital-life/kernel";
import {
  getWorkspaceCachePrefix,
  getNextWorkspaceRequestSeq,
  getNextFileRequestSeq,
  getNextChangePreviewRequestSeq,
  getNextSessionRequestSeq,
  clearWorkspaceCaches,
  createDebouncedSearch,
  workspaceRequestSeq,
} from "../shared";
import type { StoreApi } from "zustand";

const debouncedSearch = createDebouncedSearch(300);

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
      set({ error: undefined, workspaceTree: result.data });
    },

    searchFiles: async (query: string) => {
      set({ searchQuery: query });
      if (!query.trim()) {
        set({ searchResults: [] });
        return;
      }
      debouncedSearch(query, async () => {
        if (get().searchQuery !== query) return;
        const result = await window.digitalLife.workspace.search(query);
        if (get().searchQuery !== query) return;
        if (!result.ok) {
          set({ error: result.error.message });
          return;
        }
        set({ searchResults: result.data });
      });
    },
  };
}
