import type { ModelProviderId } from './types';
import type { ConversationScenario } from './types-conversation';
import type { ConversationBlockBase } from './types-conversation';
import type { ModelTokenUsage, ContextEntry } from './types-model';
import type { RiskLevel } from './types-task';

// ════════════════════════════════════════════════════════
// Run Activity Stream
// ════════════════════════════════════════════════════════

/** Main → Renderer: versioned agent run activity stream (debug/audit friendly; no chain-of-thought). */
export type DigitalLifeRunActivityEventV1 =
  | {
      v: 1;
      runId: string;
      seq: number;
      ts: number;
      type: 'run-start';
      scenario: ConversationScenario;
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
// Agent Run / Plan Steps
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
  scenario: ConversationScenario;
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

// ════════════════════════════════════════════════════════
// Execution Conversation Blocks
// ════════════════════════════════════════════════════════

export type AgentStepType = 'analyze' | 'search' | 'read' | 'edit' | 'command' | 'verify';

export interface ExecutionStepConversationBlock extends ConversationBlockBase {
  type: 'execution-step';
  stepId: string;
  title: string;
  stepType: AgentStepType;
  status: 'pending' | 'running' | 'completed' | 'failed';
  summary?: string;
  error?: string;
  riskLevel?: RiskLevel;
  toolCalls?: {
    id: string;
    toolName: string;
    inputSummary: string;
    outputSummary?: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
  }[];
}

export interface ExecutionSummaryConversationBlock extends ConversationBlockBase {
  type: 'execution-summary';
  status: 'succeeded' | 'failed' | 'rolled-back';
  filesModified: string[];
  commandsExecuted: string[];
  validationPassed?: number;
  validationFailed?: number;
  rollbackReason?: string;
  tokenUsage?: ModelTokenUsage;
}

export interface CommandOutputConversationBlock extends ConversationBlockBase {
  type: 'command-output';
  command: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
}
