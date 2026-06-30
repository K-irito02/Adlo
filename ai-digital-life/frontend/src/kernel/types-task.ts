import type { SessionMeta } from './types';

// ════════════════════════════════════════════════════════
// Task / Approval / Audit / Checkpoint
// ════════════════════════════════════════════════════════

export type TaskStatus =
  | 'pending'
  | 'waiting-approval'
  | 'approved'
  | 'running'
  | 'completed'
  | 'failed'
  | 'rejected'
  | 'rolled-back';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface TaskOperation {
  kind: string;
  target?: string;
  params: Record<string, unknown>;
  riskLevel: RiskLevel;
  reversible: boolean;
}

export interface TaskRecord {
  id: string;
  workspaceId: string;
  sessionId: string;
  type: string;
  description: string;
  status: TaskStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  operations: TaskOperation[];
  approvalId?: string;
  checkpointId?: string;
  resultJson?: string;
  errorJson?: string;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface TaskSummary {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  riskLevel: RiskLevel;
  updatedAt: number;
  detail: string;
}

export interface ApprovalRequestSummary {
  id: string;
  taskId: string;
  title: string;
  description: string;
  riskLevel: RiskLevel;
  impact: string[];
  reversible: boolean;
  createdAt: number;
  expiresAt?: number;
}

export interface ApprovalRecord {
  id: string;
  taskId: string;
  workspaceId: string;
  runId?: string;
  riskLevel: RiskLevel;
  request: ApprovalRequestSummary;
  decision?: 'approved' | 'rejected' | 'timeout';
  reason?: string;
  approvedBy?: string;
  createdAt: number;
  decidedAt?: number;
  expiresAt?: number;
}

export interface AuditRecord {
  id: string;
  entityType: 'task' | 'approval' | 'workspace' | 'session';
  entityId: string;
  action: string;
  detail: string;
  createdAt: number;
}

export interface CheckpointRecord {
  id: string;
  sessionId: string;
  workspaceId: string;
  type: 'approval-anchor' | 'workspace-open' | 'retrieval-anchor';
  description: string;
  manifest: Record<string, unknown>;
  createdAt: number;
}

export interface CheckpointPayloadAsset {
  path: string;
  kind: 'file' | 'directory';
  status: 'captured' | 'missing';
  size?: number;
  snapshotPath?: string;
}

export interface CheckpointPayloadPreview {
  checkpointId: string;
  manifestPath: string;
  rootPath?: string;
  assetCount: number;
  assets: CheckpointPayloadAsset[];
}

export interface ApprovalPolicySummary {
  mode: 'manual';
  summary: string;
  highRiskRules: string[];
}

export interface TaskCenterSnapshot {
  tasks: TaskSummary[];
  pendingApprovals: ApprovalRequestSummary[];
  policy: ApprovalPolicySummary;
  currentSession?: SessionMeta;
  latestCheckpoint?: CheckpointRecord;
}
