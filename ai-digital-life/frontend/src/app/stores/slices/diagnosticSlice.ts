/**
 * 诊断切片
 * 管理诊断信息（索引状态、仓库映射等）
 */
import type {
  IndexingStatus,
  RepoMapNode,
  AuditEntry,
  ModelGatewayHealthSnapshot
} from "@ai-digital-life/kernel";

export interface DiagnosticSlice {
  indexingStatus?: IndexingStatus;
  repoMap: RepoMapNode[];
  auditEntries: AuditEntry[];
  modelHealth?: ModelGatewayHealthSnapshot;

  setIndexingStatus: (status: IndexingStatus | undefined) => void;
  setRepoMap: (map: RepoMapNode[]) => void;
  setAuditEntries: (entries: AuditEntry[]) => void;
  appendAuditEntries: (entries: AuditEntry[]) => void;
  setModelHealth: (health: ModelGatewayHealthSnapshot | undefined) => void;
  clearDiagnosticState: () => void;
}

export const createDiagnosticSlice = (
  set: (partial: Partial<DiagnosticSlice> | ((state: DiagnosticSlice) => Partial<DiagnosticSlice>)) => void,
  get: () => DiagnosticSlice
): DiagnosticSlice => ({
  repoMap: [],
  auditEntries: [],

  setIndexingStatus: (status) => set({ indexingStatus: status }),
  setRepoMap: (map) => set({ repoMap: map }),
  setAuditEntries: (entries) => set({ auditEntries: entries }),
  appendAuditEntries: (entries) => set((state) => ({
    auditEntries: [...state.auditEntries, ...entries]
  })),
  setModelHealth: (health) => set({ modelHealth: health }),
  clearDiagnosticState: () => set({
    indexingStatus: undefined,
    repoMap: [],
    auditEntries: [],
    modelHealth: undefined
  })
});
