/**
 * Patch Store - 补丁状态管理
 * 
 * 这是一个独立的 Zustand store，专注于补丁和变更预览相关的状态。
 * 管理活跃的补丁集、变更预览、hunk 决策等。
 */

import { create } from "zustand";
import type {
  PatchSet,
  PatchApplicationResult,
  WorkspaceChangePreview,
  FilePatch,
} from "@ai-digital-life/kernel";
import {
  changePreviewRequestSeq as sharedChangePreviewRequestSeq,
  getChangePreviewCache,
  getWorkspaceScopedCacheKey,
  CHANGE_PREVIEW_CACHE_LIMIT,
  getCachedLru,
  setCachedLru,
  type CachedChangePreview,
} from "./shared";

export type PatchState = {
  // State
  activePatchSet?: PatchSet;
  latestPatchApplication?: PatchApplicationResult;
  selectedPatchFilePath?: string;
  selectedPatchHunkId?: string;
  collapsedPatchHunkIds: string[];
  selectedChangePreviewPath?: string;
  changePreview?: WorkspaceChangePreview;
  changePreviewLoading: boolean;
  
  // Actions
  setActivePatchSet: (patchSet: PatchSet | undefined) => void;
  setLatestPatchApplication: (result: PatchApplicationResult | undefined) => void;
  setSelectedPatchFilePath: (path: string | undefined) => void;
  setSelectedPatchHunkId: (hunkId: string | undefined) => void;
  addCollapsedHunkId: (hunkId: string) => void;
  removeCollapsedHunkId: (hunkId: string) => void;
  setCollapsedPatchHunkIds: (hunkIds: string[]) => void;
  setSelectedChangePreviewPath: (path: string | undefined) => void;
  setChangePreview: (preview: WorkspaceChangePreview | undefined) => void;
  setChangePreviewLoading: (loading: boolean) => void;
};

let localChangePreviewRequestSeq = sharedChangePreviewRequestSeq;

export const usePatchStore = create<PatchState>((set) => ({
  // Initial state
  collapsedPatchHunkIds: [],
  changePreviewLoading: false,

  // Actions
  setActivePatchSet: (activePatchSet) => set({ activePatchSet }),
  setLatestPatchApplication: (latestPatchApplication) => set({ latestPatchApplication }),
  setSelectedPatchFilePath: (selectedPatchFilePath) => set({ selectedPatchFilePath }),
  setSelectedPatchHunkId: (selectedPatchHunkId) => set({ selectedPatchHunkId }),
  
  addCollapsedHunkId: (hunkId) => set((state) => ({
    collapsedPatchHunkIds: state.collapsedPatchHunkIds.includes(hunkId)
      ? state.collapsedPatchHunkIds
      : [...state.collapsedPatchHunkIds, hunkId]
  })),
  
  removeCollapsedHunkId: (hunkId) => set((state) => ({
    collapsedPatchHunkIds: state.collapsedPatchHunkIds.filter(id => id !== hunkId)
  })),
  
  setCollapsedPatchHunkIds: (collapsedPatchHunkIds) => set({ collapsedPatchHunkIds }),
  setSelectedChangePreviewPath: (selectedChangePreviewPath) => set({ selectedChangePreviewPath }),
  setChangePreview: (changePreview) => set({ changePreview }),
  setChangePreviewLoading: (changePreviewLoading) => set({ changePreviewLoading }),
}));

// Patch-related actions that interact with the backend
export const patchActions = {
  openChangePreview: async (
    relativePath: string,
    appInfo: any,
    setState: (partial: Partial<PatchState>) => void
  ) => {
    const currentSeq = ++localChangePreviewRequestSeq;
    const cacheKey = getWorkspaceScopedCacheKey(appInfo, relativePath);
    const previewCache = getChangePreviewCache();
    const cachedPreview = getCachedLru(previewCache, cacheKey);

    // Optimistic update
    setState({
      selectedChangePreviewPath: relativePath,
      changePreview: cachedPreview,
      changePreviewLoading: false,
    });

    // Fetch from backend
    const result = await window.digitalLife.workspace.getChangePreview(relativePath);
    
    if (currentSeq !== localChangePreviewRequestSeq) {
      return;
    }

    if (!result.ok) {
      setState({
        selectedChangePreviewPath: relativePath,
        changePreviewLoading: false,
        changePreview: undefined,
      });
      return;
    }

    // Cache and update state
    setCachedLru(previewCache, cacheKey, result.data, CHANGE_PREVIEW_CACHE_LIMIT);
    
    setState({
      selectedChangePreviewPath: relativePath,
      changePreviewLoading: false,
      changePreview: result.data,
    });
  },

  setHunkDecision: async (
    patchSetId: string,
    hunkId: string,
    decision: "pending" | "accepted" | "rejected"
  ) => {
    return await window.digitalLife.patch.setHunkDecision({ 
      patchSetId, 
      hunkId, 
      decision 
    });
  },

  applyPatchSet: async (patchSetId: string) => {
    return await window.digitalLife.patch.applyPatchSet(patchSetId);
  },

  rollbackPatchSet: async (patchSetId: string) => {
    return await window.digitalLife.patch.rollbackPatchSet(patchSetId);
  },

  acceptAllHunks: async (patchSet: PatchSet, setHunkDecision: any) => {
    for (const filePatch of patchSet.filePatches) {
      for (const hunk of filePatch.hunks) {
        if (hunk.decision !== "accepted") {
          await setHunkDecision(patchSet.id, hunk.id, "accepted");
        }
      }
    }
  },

  rejectAllHunks: async (patchSet: PatchSet, setHunkDecision: any) => {
    for (const filePatch of patchSet.filePatches) {
      for (const hunk of filePatch.hunks) {
        if (hunk.decision !== "rejected") {
          await setHunkDecision(patchSet.id, hunk.id, "rejected");
        }
      }
    }
  },

  getPatchSet: async (patchSetId: string) => {
    return await window.digitalLife.patch.getPatchSet(patchSetId);
  },
};

/**
 * Selectors for Patch Store
 */
export const patchSelectors = {
  /** Check if has active patch set */
  hasActivePatchSet: (state: PatchState) => Boolean(state.activePatchSet),
  
  /** Check if change preview is loading */
  isChangePreviewLoading: (state: PatchState) => state.changePreviewLoading,
  
  /** Check if has change preview */
  hasChangePreview: (state: PatchState) => Boolean(state.changePreview),
  
  /** Get file patch by path */
  getFilePatchByPath: (path: string) => (state: PatchState) =>
    state.activePatchSet?.filePatches.find(p => p.relativePath === path),
  
  /** Get total hunk count */
  getTotalHunkCount: (state: PatchState) => {
    if (!state.activePatchSet) return 0;
    return state.activePatchSet.filePatches.reduce(
      (sum, fp) => sum + fp.hunks.length, 
      0
    );
  },
  
  /** Get accepted hunk count */
  getAcceptedHunkCount: (state: PatchState) => {
    if (!state.activePatchSet) return 0;
    return state.activePatchSet.filePatches.reduce(
      (sum, fp) => sum + fp.hunks.filter(h => h.decision === "accepted").length,
      0
    );
  },
  
  /** Get rejected hunk count */
  getRejectedHunkCount: (state: PatchState) => {
    if (!state.activePatchSet) return 0;
    return state.activePatchSet.filePatches.reduce(
      (sum, fp) => sum + fp.hunks.filter(h => h.decision === "rejected").length,
      0
    );
  },
  
  /** Get pending hunk count */
  getPendingHunkCount: (state: PatchState) => {
    if (!state.activePatchSet) return 0;
    return state.activePatchSet.filePatches.reduce(
      (sum, fp) => sum + fp.hunks.filter(h => h.decision === "pending").length,
      0
    );
  },
  
  /** Check if hunk is collapsed */
  isHunkCollapsed: (hunkId: string) => (state: PatchState) =>
    state.collapsedPatchHunkIds.includes(hunkId),
  
  /** Get file patch count */
  getFilePatchCount: (state: PatchState) =>
    state.activePatchSet?.filePatches.length ?? 0,
  
  /** Check if all hunks are reviewed */
  areAllHunksReviewed: (state: PatchState) => {
    if (!state.activePatchSet) return false;
    return state.activePatchSet.filePatches.every(fp =>
      fp.hunks.every(h => h.decision !== "pending")
    );
  },
};
