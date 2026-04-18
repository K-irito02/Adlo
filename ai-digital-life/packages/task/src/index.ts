import { createId, type ApprovalRequestSummary, type RiskLevel, type TaskOperation } from "@ai-digital-life/kernel";

export function assessRiskLevel(operations: TaskOperation[]): RiskLevel {
  if (operations.some((operation) => operation.riskLevel === "high")) {
    return "high";
  }
  if (operations.some((operation) => operation.riskLevel === "medium")) {
    return "medium";
  }
  return "low";
}

export function shouldRequireApproval(operations: TaskOperation[]): boolean {
  return assessRiskLevel(operations) === "high";
}

export function createApprovalRequest(input: {
  taskId: string;
  title: string;
  description: string;
  operations: TaskOperation[];
  impact: string[];
  createdAt?: number;
}): ApprovalRequestSummary {
  const riskLevel = assessRiskLevel(input.operations);
  const now = input.createdAt ?? Date.now();

  return {
    id: createId("approval"),
    taskId: input.taskId,
    title: input.title,
    description: input.description,
    riskLevel,
    impact: input.impact,
    reversible: input.operations.every((operation) => operation.reversible),
    createdAt: now
  };
}
