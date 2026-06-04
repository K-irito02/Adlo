/**
 * 诊断切片
 * 管理诊断信息（索引状态、仓库映射等）
 */
import type {
  AuditEntry,
  IndexingStatus,
  ModelGatewayHealthSnapshot,
  RepoMapNode,
} from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';

export interface DiagnosticSlice {
  auditEntries: AuditEntry[];
  modelHealth?: ModelGatewayHealthSnapshot;
  indexingStatus?: IndexingStatus;
  repoMap: RepoMapNode[];

  setAuditEntries: (entries: AuditEntry[]) => void;
  appendAuditEntries: (entries: AuditEntry[]) => void;
  setModelHealth: (health: ModelGatewayHealthSnapshot | undefined) => void;
  setIndexingStatus: (status: IndexingStatus | undefined) => void;
  setRepoMap: (map: RepoMapNode[]) => void;
  clearDiagnosticState: () => void;
}

export const createDiagnosticSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState
): DiagnosticSlice => ({
  auditEntries: [],
  repoMap: [],

  setAuditEntries: (entries) => set({ auditEntries: entries }),
  appendAuditEntries: (entries) =>
    set((state) => ({
      auditEntries: [...state.auditEntries, ...entries],
    })),
  setModelHealth: (health) => set({ modelHealth: health }),
  setIndexingStatus: (status) => set({ indexingStatus: status }),
  setRepoMap: (map) => set({ repoMap: map }),
  clearDiagnosticState: () =>
    set({
      auditEntries: [],
      modelHealth: undefined,
      indexingStatus: undefined,
      repoMap: [],
    }),
});
