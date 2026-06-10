import type { TaskBridge } from "../shared/ipc";
import type { ApprovalRequestSummary } from "@ai-digital-life/kernel";
import { createMockTaskSnapshot, mockAuditEntries } from "../test-fixtures/mock-data";

export const mockTask: TaskBridge = {
  getSnapshot: async () => ({
    ok: true,
    data: createMockTaskSnapshot()
  }),
  listPendingApprovals: async (): Promise<{ ok: true; data: ApprovalRequestSummary[] }> => ({
    ok: true,
    data: [] as ApprovalRequestSummary[]
  }),
  getCheckpointPreview: async () => ({ ok: true, data: undefined }),
  restoreCheckpoint: async () => ({
    ok: true,
    data: createMockTaskSnapshot()
  }),
  decideApproval: async () => ({
    ok: true,
    data: createMockTaskSnapshot()
  }),
  listAuditEntries: async (_limit?: number): Promise<{ ok: true; data: typeof mockAuditEntries }> => ({
    ok: true,
    data: mockAuditEntries
  })
};