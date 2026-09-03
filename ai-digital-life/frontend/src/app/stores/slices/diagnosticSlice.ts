/**
 * 诊断切片
 * 管理诊断信息（索引状态、仓库映射等）
 */
import type { IndexingStatus, RepoMapNode } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';

export interface DiagnosticSlice {
  indexingStatus?: IndexingStatus;
  repoMap: RepoMapNode[];

  setIndexingStatus: (status: IndexingStatus | undefined) => void;
  setRepoMap: (map: RepoMapNode[]) => void;
  clearDiagnosticState: () => void;
}

export const createDiagnosticSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): DiagnosticSlice => ({
  repoMap: [],

  setIndexingStatus: (status) => set({ indexingStatus: status }),
  setRepoMap: (map) => set({ repoMap: map }),
  clearDiagnosticState: () =>
    set({
      indexingStatus: undefined,
      repoMap: [],
    }),
});
