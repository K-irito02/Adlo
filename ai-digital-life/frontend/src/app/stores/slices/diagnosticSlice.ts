/**
 * 诊断切片
 * 管理诊断信息（索引状态、仓库映射等）
 */
import type {
  AuditEntry,
  ModelGatewayHealthSnapshot
} from "@ai-digital-life/kernel";
import type { StoreState } from "../StoreState";

export interface DiagnosticSlice {
  auditEntries: AuditEntry[];
  modelHealth?: ModelGatewayHealthSnapshot;

  setAuditEntries: (entries: AuditEntry[]) => void;
  appendAuditEntries: (entries: AuditEntry[]) => void;
  setModelHealth: (health: ModelGatewayHealthSnapshot | undefined) => void;
  clearDiagnosticState: () => void;
}

export const createDiagnosticSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState
): DiagnosticSlice => ({
  auditEntries: [],

  setAuditEntries: (entries) => set({ auditEntries: entries }),
  appendAuditEntries: (entries) => set((state) => ({
    auditEntries: [...state.auditEntries, ...entries]
  })),
  setModelHealth: (health) => set({ modelHealth: health }),
  clearDiagnosticState: () => set({
    auditEntries: [],
    modelHealth: undefined
  })
});
