import type { ModelProviderId, SessionMeta } from './types';

// ════════════════════════════════════════════════════════
// Task / Approval / Audit / Checkpoint (from types-task.ts)
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

export interface CheckpointRecord {
  id: string;
  sessionId: string;
  workspaceId: string;
  type: 'approval-anchor' | 'workspace-open' | 'retrieval-anchor';
  description: string;
  manifest: Record<string, unknown>;
  createdAt: number;
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

// ════════════════════════════════════════════════════════
// Model Types (from types-model.ts)
// ════════════════════════════════════════════════════════

export interface ModelDescriptor {
  providerId: ModelProviderId;
  modelId: string;
  displayName: string;
  priority: number;
  capabilities: ('chat' | 'stream' | 'code')[];
}

export interface ModelChatMessage {
  role: string;
  content: string;
}

export interface ModelTokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  estimated?: boolean;
  cost?: ModelUsageCost;
}

export interface ModelUsageCost {
  inputCost?: number;
  outputCost?: number;
  cacheReadCost?: number;
  cacheWriteCost?: number;
  totalCost?: number;
}

export interface ModelRouteDecision {
  reason: string;
  chain: string[];
  synthetic?: boolean;
}

export interface ModelResponse {
  providerId: ModelProviderId;
  modelId: string;
  content: string;
  synthetic: boolean;
  requestId?: string;
  usage?: ModelTokenUsage;
  route?: ModelRouteDecision;
}

/** Main → Renderer: versioned model stream envelope (no secrets). */
export type DigitalLifeModelStreamEventV1 =
  | { v: 1; runId: string; seq: number; type: 'delta'; text: string }
  | {
      v: 1;
      runId: string;
      seq: number;
      type: 'route';
      providerId: ModelProviderId;
      modelId: string;
      reason: string;
    }
  | { v: 1; runId: string; seq: number; type: 'usage'; usage: ModelTokenUsage }
  | { v: 1; runId: string; seq: number; type: 'error'; message: string }
  | { v: 1; runId: string; seq: number; type: 'done' };

export interface ProviderHealthStatus {
  providerId: ModelProviderId;
  healthy: boolean;
  detail: string;
}

export interface ModelGatewayHealthSnapshot {
  checkedAt: number;
  providers: ProviderHealthStatus[];
}

export interface PromptRule {
  id: string;
  kind: 'platform' | 'project' | 'session' | 'workflow-phase' | 'tool-contract' | 'output-contract';
  content: string;
}

export interface ContextEntry {
  id: string;
  type: 'file' | 'search-hit' | 'outline' | 'diagnostic' | 'message';
  label: string;
  content: string;
  tokenEstimate: number;
  path?: string;
}

// ════════════════════════════════════════════════════════
// Command Types (from types-command.ts)
// ════════════════════════════════════════════════════════

export type CommandProfile = 'build' | 'test' | 'lint' | 'install' | 'custom';

export interface CommandRequest {
  id: string;
  workspaceId: string;
  runId?: string;
  profile: CommandProfile;
  command: string;
  args: string[];
  shell: boolean;
  riskLevel: RiskLevel;
  createdAt: number;
}

export interface CommandExecutionResult {
  request: CommandRequest;
  exitCode: number | null;
  signal?: string;
  stdout: string;
  stderr: string;
  summary: string;
  success: boolean;
  startedAt: number;
  completedAt: number;
}

export interface CommandRunResult {
  status: 'completed' | 'waiting-approval';
  taskId: string;
  request: CommandRequest;
  result?: CommandExecutionResult;
  approvalRequest?: ApprovalRequestSummary;
}

/** Main → Renderer: versioned terminal stream (no env vars or secrets). */
export type DigitalLifeTerminalStreamEventV1 =
  | { v: 1; executionId: string; seq: number; type: 'stdout'; text: string }
  | { v: 1; executionId: string; seq: number; type: 'stderr'; text: string }
  | {
      v: 1;
      executionId: string;
      seq: number;
      type: 'done';
      exitCode: number | null;
      success: boolean;
      summary: string;
      signal?: string;
    }
  | { v: 1; executionId: string; seq: number; type: 'error'; message: string };

export type CommandRunStreamStart =
  | {
      mode: 'waiting-approval';
      taskId: string;
      request: CommandRequest;
      approvalRequest: ApprovalRequestSummary;
    }
  | { mode: 'started'; executionId: string; taskId: string; request: CommandRequest };

// ════════════════════════════════════════════════════════
// Agent Run / Plan Steps (from types-agent.ts)
// ════════════════════════════════════════════════════════

export type AgentRunStatus =
  | 'draft'
  | 'planning'
  | 'ready'
  | 'executing'
  | 'waiting-approval'
  | 'applying'
  | 'verifying'
  | 'succeeded'
  | 'failed'
  | 'rolled-back'
  | 'aborted';

export interface AgentPlanStep {
  id: string;
  runId: string;
  title: string;
  detail?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
}

export interface AgentRunRecord {
  id: string;
  workspaceId: string;
  sessionId: string;
  prompt: string;
  status: AgentRunStatus;
  summary?: string;
  patchSetId?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface AgentRunDetail {
  run: AgentRunRecord;
  steps: AgentPlanStep[];
}

// Run Activity Stream

/** Main → Renderer: versioned agent run activity stream (debug/audit friendly; no chain-of-thought). */
export type DigitalLifeRunActivityEventV1 =
  | {
      v: 1;
      runId: string;
      seq: number;
      ts: number;
      type: 'run-start';
    }
  | {
      v: 1;
      runId: string;
      seq: number;
      ts: number;
      type: 'context-added';
      contextType: ContextEntry['type'] | 'symbol';
      label: string;
      path?: string;
      tokenEstimate?: number;
      truncated?: boolean;
    }
  | {
      v: 1;
      runId: string;
      seq: number;
      ts: number;
      type: 'file-read';
      path: string;
      bytes?: number;
      tokenEstimate?: number;
      truncated?: boolean;
    }
  | {
      v: 1;
      runId: string;
      seq: number;
      ts: number;
      type: 'search';
      query: string;
      hitCount?: number;
      samplePaths?: string[];
    }
  | {
      v: 1;
      runId: string;
      seq: number;
      ts: number;
      type: 'command';
      phase: 'start' | 'done';
      command: string;
      args?: string[];
      exitCode?: number;
    }
  | {
      v: 1;
      runId: string;
      seq: number;
      ts: number;
      type: 'patch';
      phase: 'proposed' | 'applied' | 'rolled-back';
      patchSetId: string;
      fileCount?: number;
      hunkCount?: number;
    }
  | {
      v: 1;
      runId: string;
      seq: number;
      ts: number;
      type: 'approval';
      phase: 'requested' | 'decided';
      approvalId: string;
      decision?: 'approved' | 'rejected' | 'timeout' | 'auto';
      reason?: string;
    }
  | {
      v: 1;
      runId: string;
      seq: number;
      ts: number;
      type: 'model';
      phase: 'route' | 'done' | 'error';
      providerId?: ModelProviderId;
      modelId?: string;
      reason?: string;
      usage?: ModelTokenUsage;
      message?: string;
    }
  | { v: 1; runId: string; seq: number; ts: number; type: 'error'; message: string }
  | { v: 1; runId: string; seq: number; ts: number; type: 'run-done'; status: AgentRunStatus };

export interface RunActivityEventRecord {
  id: string;
  workspaceId: string;
  sessionId: string;
  runId: string;
  seq: number;
  ts: number;
  event: DigitalLifeRunActivityEventV1;
  createdAt: number;
}

// ════════════════════════════════════════════════════════
// Host sidebar ordering (retained: workspace drag-reorder)
// ════════════════════════════════════════════════════════

export interface ReorderWorkspacesInput {
  pinnedIds: string[];
  unpinnedIds: string[];
}
