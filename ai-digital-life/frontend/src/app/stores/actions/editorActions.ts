import type { StoreState } from "../StoreState";
import { createEditorTab } from "../../editorTabs";
import { buildOutlineFromContent } from "../../../shared/outline";
import { normalizeWorkspaceRelativePath, mergeDirtyEditorPaths } from "../../workspacePaths";
import {
  getWorkspaceScopedCacheKey,
  getFileDocumentCache,
  getChangePreviewCache,
  FILE_DOCUMENT_CACHE_LIMIT,
  CHANGE_PREVIEW_CACHE_LIMIT,
  getCachedLru,
  setCachedLru,
  getNextFileRequestSeq,
  getNextChangePreviewRequestSeq,
  fileRequestSeq,
  changePreviewRequestSeq,
  type CachedFileDocument,
} from "../shared";
import type { FileOutlineItem } from "@ai-digital-life/kernel";
import type { StoreApi } from "zustand";

const fileDocumentCache = getFileDocumentCache();
const changePreviewCache = getChangePreviewCache();

export function createEditorActions(set: StoreApi<StoreState>["setState"], get: () => StoreState) {
  return {
    openFile: async (relativePath: string) => {
      const requestSeq = getNextFileRequestSeq();
      const cacheKey = getWorkspaceScopedCacheKey(get().appInfo, relativePath);
      const cachedDocument = getCachedLru(fileDocumentCache, cacheKey);
      const applyDocument = (
        document: CachedFileDocument,
        outlineOverride?: FileOutlineItem[]
      ) => {
        const nextOutline =
          outlineOverride ?? buildOutlineFromContent(document.content, relativePath);
        const norm = normalizeWorkspaceRelativePath(relativePath);
        set((state: StoreState) => {
          const nextDirty = state.dirtyEditorPaths.filter(
            (p) => normalizeWorkspaceRelativePath(p) !== norm
          );
          void window.digitalLife.workspace.setEditorDirtyPaths(nextDirty);
          return {
            error: undefined,
            openTabs: state.openTabs.some((tab) => tab.path === relativePath)
              ? state.openTabs
              : [...state.openTabs, createEditorTab(relativePath)],
            selectedFilePath: relativePath,
            fileContent: document.content,
            fileLastModifiedAt: document.lastModifiedAt,
            externalFileChange:
              state.externalFileChange?.path === relativePath
                ? undefined
                : state.externalFileChange,
            outline: nextOutline,
            dirtyEditorPaths: nextDirty,
          };
        });
      };

      if (cachedDocument) {
        applyDocument(cachedDocument);
        return;
      } else {
        set((state: StoreState) => ({
          error: undefined,
          openTabs: state.openTabs.some((tab) => tab.path === relativePath)
            ? state.openTabs
            : [...state.openTabs, createEditorTab(relativePath)],
          selectedFilePath: relativePath,
        }));
      }

      const fileResult = await window.digitalLife.workspace.readFile(
        relativePath
      );
      if (requestSeq !== fileRequestSeq) return;
      if (!fileResult.ok) {
        set({ error: fileResult.error.message });
        return;
      }
      const nextOutline = buildOutlineFromContent(
        fileResult.data.content,
        relativePath
      );
      const nextDocument: CachedFileDocument = {
        content: fileResult.data.content,
        lastModifiedAt: fileResult.data.lastModifiedAt,
      };
      setCachedLru(fileDocumentCache, cacheKey, nextDocument, FILE_DOCUMENT_CACHE_LIMIT);
      applyDocument(nextDocument, nextOutline);
    },

    openChangePreview: async (relativePath: string) => {
      const requestSeq = getNextChangePreviewRequestSeq();
      const cacheKey = getWorkspaceScopedCacheKey(get().appInfo, relativePath);
      const cachedPreview = getCachedLru(changePreviewCache, cacheKey);
      set({
        selectedChangePreviewPath: relativePath,
        changePreview: cachedPreview ?? get().changePreview,
        changePreviewLoading: false,
        error: undefined,
      });
      const result = await window.digitalLife.workspace.getChangePreview(
        relativePath
      );
      if (requestSeq !== changePreviewRequestSeq) return;
      if (!result.ok) {
        set({
          selectedChangePreviewPath: relativePath,
          changePreviewLoading: false,
          changePreview:
            get().changePreview?.path === relativePath
              ? undefined
              : get().changePreview,
        });
        return;
      }
      setCachedLru(
        changePreviewCache,
        cacheKey,
        result.data,
        CHANGE_PREVIEW_CACHE_LIMIT
      );
      set({
        selectedChangePreviewPath: relativePath,
        changePreviewLoading: false,
        changePreview: result.data,
        error: undefined,
      });
    },

    openChangePreviewForWorkspace: async (workspacePath: string, relativePath: string) => {
      const requestSeq = getNextChangePreviewRequestSeq();
      const cacheKey = getWorkspaceScopedCacheKey(get().appInfo, `${workspacePath}:${relativePath}`);
      const cachedPreview = getCachedLru(changePreviewCache, cacheKey);
      set({
        selectedChangePreviewPath: relativePath,
        changePreview: cachedPreview ?? get().changePreview,
        changePreviewLoading: false,
        error: undefined,
      });
      const result = await window.digitalLife.workspace.getChangePreviewForWorkspace(
        workspacePath,
        relativePath
      );
      if (requestSeq !== changePreviewRequestSeq) return;
      if (!result.ok) {
        set({
          selectedChangePreviewPath: relativePath,
          changePreviewLoading: false,
          changePreview:
            get().changePreview?.path === relativePath
              ? undefined
              : get().changePreview,
        });
        return;
      }
      setCachedLru(changePreviewCache, cacheKey, result.data, CHANGE_PREVIEW_CACHE_LIMIT);
      set({
        selectedChangePreviewPath: relativePath,
        changePreviewLoading: false,
        changePreview: result.data,
        error: undefined,
      });
    },

    createWorkspaceFile: async (relativePath: string, content = "") => {
      const result = await window.digitalLife.workspace.createFile(
        relativePath,
        content
      );
      if (!result.ok) {
        set({ error: result.error.message });
        return undefined;
      }
      await get().refreshWorkspaceTree();
      const nextOutline = buildOutlineFromContent(
        result.data.content,
        relativePath
      );
      const norm = normalizeWorkspaceRelativePath(relativePath);
      set((state: StoreState) => {
        const nextDirty = state.dirtyEditorPaths.filter(
          (p) => normalizeWorkspaceRelativePath(p) !== norm
        );
        void window.digitalLife.workspace.setEditorDirtyPaths(nextDirty);
        return {
          error: undefined,
          openTabs: state.openTabs.some((tab) => tab.path === relativePath)
            ? state.openTabs
            : [...state.openTabs, createEditorTab(relativePath)],
          selectedFilePath: relativePath,
          fileContent: result.data.content,
          fileLastModifiedAt: result.data.lastModifiedAt,
          externalFileChange:
            state.externalFileChange?.path === relativePath
              ? undefined
              : state.externalFileChange,
          outline: nextOutline,
          dirtyEditorPaths: nextDirty,
        };
      });
      return relativePath;
    },

    createWorkspaceFolder: async (relativePath: string) => {
      const result = await window.digitalLife.workspace.createFolder(
        relativePath
      );
      if (!result.ok) {
        set({ error: result.error.message });
        return undefined;
      }
      await get().refreshWorkspaceTree();
      set({ error: undefined });
      return relativePath;
    },

    markExternalFileChange: ({ path, lastModifiedAt }: { path: string; lastModifiedAt: number }) => {
      const selected = normalizeWorkspaceRelativePath(
        get().selectedFilePath ?? ""
      );
      const incoming = normalizeWorkspaceRelativePath(path);
      if (!selected || selected !== incoming) return;
      if (
        typeof get().fileLastModifiedAt === "number" &&
        get().fileLastModifiedAt === lastModifiedAt
      )
        return;
      console.info("[workspace] external file changed", {
        path: incoming,
        lastModifiedAt,
      });
      set((state: StoreState) => {
        const nextDirty = [...new Set([...state.dirtyEditorPaths, incoming])];
        void window.digitalLife.workspace.setEditorDirtyPaths(nextDirty);
        return {
          externalFileChange: { path, lastModifiedAt },
          dirtyEditorPaths: nextDirty,
        };
      });
    },

    notifyEditorBufferDirty: (relativePath: string, isDirty: boolean) => {
      set((state: StoreState) => {
        const nextDirty = mergeDirtyEditorPaths(
          state.dirtyEditorPaths,
          relativePath,
          isDirty
        );
        void window.digitalLife.workspace.setEditorDirtyPaths(nextDirty);
        return { dirtyEditorPaths: nextDirty };
      });
    },
  };
}
