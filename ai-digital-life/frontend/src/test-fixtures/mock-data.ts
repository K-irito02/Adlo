import type { AuditEntry, TaskCenterSnapshot } from "@ai-digital-life/kernel";

export function createMockPolicy(): TaskCenterSnapshot["policy"] {
  return {
    mode: "manual",
    summary: "High-risk actions stay approval-bound.",
    highRiskRules: ["Patch apply remains explicit."]
  };
}

export function createMockTaskSnapshot(): TaskCenterSnapshot {
  return {
    tasks: [],
    pendingApprovals: [],
    policy: createMockPolicy()
  };
}

export const mockAuditEntries: AuditEntry[] = [
  {
    id: "audit-1",
    timestamp: Date.now() - 60_000,
    operationType: "command",
    summary: "npm run test",
    riskLevel: "low",
    decision: "auto"
  },
  {
    id: "audit-2",
    timestamp: Date.now() - 120_000,
    operationType: "patch-apply",
    summary: "Applied patch to frontend/src/main.tsx",
    riskLevel: "medium",
    decision: "approved"
  },
  {
    id: "audit-3",
    timestamp: Date.now() - 180_000,
    operationType: "file-write",
    summary: "Updated configuration file",
    riskLevel: "low",
    decision: "auto"
  }
];
