import type { ModelProviderId } from './types';

// ════════════════════════════════════════════════════════
// Model Types (retained: ModelTokenUsage, ModelGatewayHealthSnapshot,
//   DigitalLifeModelStreamEventV1, ContextEntry — used by httpBridge/bridge)
// ════════════════════════════════════════════════════════

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

export interface ProviderHealthStatus {
  providerId: ModelProviderId;
  healthy: boolean;
  detail: string;
}

export interface ModelGatewayHealthSnapshot {
  checkedAt: number;
  providers: ProviderHealthStatus[];
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

export interface ContextEntry {
  id: string;
  type: 'file' | 'search-hit' | 'outline' | 'diagnostic' | 'message';
  label: string;
  content: string;
  tokenEstimate: number;
  path?: string;
}

// ════════════════════════════════════════════════════════
// Command Types (retained: CommandExecutionResult — used by patch system)
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
  riskLevel: string;
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

// ════════════════════════════════════════════════════════
// Agent Run / Plan Steps (retained: used by httpBridge + mock system)
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

// ════════════════════════════════════════════════════════
// Host sidebar ordering (retained: workspace drag-reorder)
// ════════════════════════════════════════════════════════

export interface ReorderWorkspacesInput {
  pinnedIds: string[];
  unpinnedIds: string[];
}
