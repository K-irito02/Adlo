/**
 * 诊断切片
 * 管理诊断信息（索引状态、仓库映射等）
 */
import type {
  IndexingStatus,
  ModelGatewayHealthSnapshot,
  RepoMapNode,
} from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';

export interface DiagnosticSlice {
  modelHealth?: ModelGatewayHealthSnapshot;
  indexingStatus?: IndexingStatus;
  repoMap: RepoMapNode[];

  setModelHealth: (health: ModelGatewayHealthSnapshot | undefined) => void;
  setIndexingStatus: (status: IndexingStatus | undefined) => void;
  setRepoMap: (map: RepoMapNode[]) => void;
  clearDiagnosticState: () => void;
}

export const createDiagnosticSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): DiagnosticSlice => ({
  repoMap: [],

  setModelHealth: (health) => set({ modelHealth: health }),
  setIndexingStatus: (status) => set({ indexingStatus: status }),
  setRepoMap: (map) => set({ repoMap: map }),
  clearDiagnosticState: () =>
    set({
      modelHealth: undefined,
      indexingStatus: undefined,
      repoMap: [],
    }),
});
