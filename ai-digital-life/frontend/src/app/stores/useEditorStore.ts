/**
 * Editor Store - 编辑器状态管理
 * 
 * 这是一个独立的 Zustand store，专注于编辑器相关的状态。
 * 管理打开的标签页、当前文件、编辑器大纲等。
 */

import { create } from "zustand";
import type { FileOutlineItem } from "@ai-digital-life/kernel";
import { createEditorTab, type EditorTabState } from "../editorTabs";
import {
  fileRequestSeq as sharedFileRequestSeq,
  getFileDocumentCache,
  getWorkspaceScopedCacheKey,
  FILE_DOCUMENT_CACHE_LIMIT,
  getCachedLru,
  setCachedLru,
  type CachedFileDocument,
} from "./shared";

export type EditorState = {
  // State
  openTabs: EditorTabState[];
  selectedFilePath?: string;
  fileContent?: string;
  fileLastModifiedAt?: number;
  externalFileChange?: { path: string; lastModifiedAt: number };
  outline: FileOutlineItem[];
  dirtyEditorPaths: string[];
  
  // Actions
  setOpenTabs: (tabs: EditorTabState[]) => void;
  addOpenTab: (tab: EditorTabState) => void;
  removeOpenTab: (path: string) => void;
  setSelectedFilePath: (path: string | undefined) => void;
  setFileContent: (content: string | undefined) => void;
  setFileLastModifiedAt: (timestamp: number | undefined) => void;
  setExternalFileChange: (change: { path: string; lastModifiedAt: number } | undefined) => void;
  setOutline: (outline: FileOutlineItem[]) => void;
  addDirtyPath: (path: string) => void;
  removeDirtyPath: (path: string) => void;
  clearDirtyPaths: () => void;
};

let localFileRequestSeq = sharedFileRequestSeq;

export const useEditorStore = create<EditorState>((set, get) => ({
  // Initial state
  openTabs: [],
  outline: [],
  dirtyEditorPaths: [],

  // Actions
  setOpenTabs: (openTabs) => set({ openTabs }),
  
  addOpenTab: (tab) => set((state) => {
    if (state.openTabs.some((t: EditorTabState) => t.path === tab.path)) {
      return state;
    }
    return { openTabs: [...state.openTabs, tab] };
  }),
  
  removeOpenTab: (path) => set((state) => ({
    openTabs: state.openTabs.filter((t: EditorTabState) => t.path !== path)
  })),
  
  setSelectedFilePath: (selectedFilePath) => set({ selectedFilePath }),
  setFileContent: (fileContent) => set({ fileContent }),
  setFileLastModifiedAt: (fileLastModifiedAt) => set({ fileLastModifiedAt }),
  setExternalFileChange: (externalFileChange) => set({ externalFileChange }),
  setOutline: (outline) => set({ outline }),
  
  addDirtyPath: (path) => set((state) => {
    if (state.dirtyEditorPaths.includes(path)) {
      return state;
    }
    const nextDirty = [...state.dirtyEditorPaths, path];
    void window.digitalLife.workspace.setEditorDirtyPaths(nextDirty);
    return { dirtyEditorPaths: nextDirty };
  }),
  
  removeDirtyPath: (path) => set((state) => {
    const nextDirty = state.dirtyEditorPaths.filter((p: string) => p !== path);
    void window.digitalLife.workspace.setEditorDirtyPaths(nextDirty);
    return { dirtyEditorPaths: nextDirty };
  }),
  
  clearDirtyPaths: () => {
    void window.digitalLife.workspace.setEditorDirtyPaths([]);
    set({ dirtyEditorPaths: [] });
  },
}));

// Editor-related actions that interact with the backend
export const editorActions = {
  openFile: async (
    relativePath: string,
    appInfo: any,
    setState: (partial: Partial<EditorState>) => void
  ) => {
    const currentSeq = ++localFileRequestSeq;
    const cacheKey = getWorkspaceScopedCacheKey(appInfo, relativePath);
    const fileCache = getFileDocumentCache();
    const cachedDocument = getCachedLru(fileCache, cacheKey);

    // Optimistic update
    const currentTabs = useEditorStore.getState().openTabs;
    const tabExists = currentTabs.some((t: EditorTabState) => t.path === relativePath);
    
    setState({
      selectedFilePath: relativePath,
      openTabs: tabExists 
        ? currentTabs 
        : [...currentTabs, createEditorTab(relativePath)]
    });

    if (cachedDocument) {
      setState({
        fileContent: cachedDocument.content,
        fileLastModifiedAt: cachedDocument.lastModifiedAt,
        externalFileChange: undefined
      });
    }

    // Fetch from backend
    const result = await window.digitalLife.workspace.readFile(relativePath);
    
    if (currentSeq !== localFileRequestSeq) {
      return;
    }

    if (!result.ok) {
      return;
    }

    // Cache and update state
    const document: CachedFileDocument = {
      content: result.data.content,
      lastModifiedAt: result.data.lastModifiedAt
    };
    setCachedLru(fileCache, cacheKey, document, FILE_DOCUMENT_CACHE_LIMIT);
    
    setState({
      fileContent: result.data.content,
      fileLastModifiedAt: result.data.lastModifiedAt,
      externalFileChange: undefined
    });
  },

  createFile: async (relativePath: string, content: string = "") => {
    const result = await window.digitalLife.workspace.createFile(relativePath, content);
    return result;
  },

  createFolder: async (relativePath: string) => {
    const result = await window.digitalLife.workspace.createFolder(relativePath);
    return result;
  },

  markExternalFileChange: (
    path: string,
    lastModifiedAt: number
  ) => {
    const state = useEditorStore.getState();
    const selected = state.selectedFilePath;
    if (!selected || selected !== path) {
      return;
    }

    if (typeof state.fileLastModifiedAt === "number" && 
        state.fileLastModifiedAt === lastModifiedAt) {
      return;
    }

    console.info("[workspace] external file changed", { path, lastModifiedAt });
    
    const nextDirty = [...new Set([...state.dirtyEditorPaths, path])];
    void window.digitalLife.workspace.setEditorDirtyPaths(nextDirty);
    
    useEditorStore.setState({
      externalFileChange: { path, lastModifiedAt },
      dirtyEditorPaths: nextDirty
    });
  },

  notifyBufferDirty: (
    relativePath: string,
    isDirty: boolean
  ) => {
    const state = useEditorStore.getState();
    let nextDirty: string[];
    
    if (isDirty) {
      nextDirty = state.dirtyEditorPaths.includes(relativePath)
        ? state.dirtyEditorPaths
        : [...state.dirtyEditorPaths, relativePath];
    } else {
      nextDirty = state.dirtyEditorPaths.filter((p: string) => p !== relativePath);
    }
    
    void window.digitalLife.workspace.setEditorDirtyPaths(nextDirty);
    useEditorStore.setState({ dirtyEditorPaths: nextDirty });
  },

  closeTab: (path: string) => {
    const state = useEditorStore.getState();
    const remainingTabs = state.openTabs.filter((t: EditorTabState) => t.path !== path);
    const newSelected = state.selectedFilePath === path 
      ? remainingTabs[0]?.path 
      : state.selectedFilePath;
    
    useEditorStore.setState({
      openTabs: remainingTabs,
      selectedFilePath: newSelected
    });
  },
};

/**
 * Selectors for Editor Store
 */
export const editorSelectors = {
  /** Get open tab count */
  getOpenTabCount: (state: EditorState) => state.openTabs.length,
  
  /** Check if file is open */
  isFileOpen: (path: string) => (state: EditorState) => 
    state.openTabs.some((t: EditorTabState) => t.path === path),
  
  /** Check if file is dirty */
  isFileDirty: (path: string) => (state: EditorState) => 
    state.dirtyEditorPaths.includes(path),
  
  /** Get dirty file count */
  getDirtyFileCount: (state: EditorState) => state.dirtyEditorPaths.length,
  
  /** Check if has unsaved changes */
  hasUnsavedChanges: (state: EditorState) => state.dirtyEditorPaths.length > 0,
  
  /** Get tab by path */
  getTabByPath: (path: string) => (state: EditorState) =>
    state.openTabs.find((t: EditorTabState) => t.path === path),
  
  /** Get file extension from selected path */
  getSelectedFileExtension: (state: EditorState) => {
    if (!state.selectedFilePath) return undefined;
    const parts = state.selectedFilePath.split(".");
    return parts.length > 1 ? parts[parts.length - 1] : undefined;
  },
  
  /** Check if can open more tabs */
  canOpenMoreTabs: (state: EditorState) => state.openTabs.length < 20,
};
