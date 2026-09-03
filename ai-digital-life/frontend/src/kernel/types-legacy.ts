import type { ModelProviderId, SessionMeta } from './types';
import type { DiagnosticSummary } from './types-workspace-files';
import type { PatchSet } from './types-patch';

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

// Run Activity Stream

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
// Conversation Blocks / Sessions / Messages (from types-conversation.ts)
// ════════════════════════════════════════════════════════

export type ConversationRole = 'system' | 'user' | 'assistant' | 'tool';
export type ConversationBlockType =
  | 'markdown'
  | 'plan'
  | 'tool-call'
  | 'approval'
  | 'patch-summary'
  | 'validation-result'
  | 'final-summary'
  | 'execution-step'
  | 'execution-summary'
  | 'command-output';

export interface ConversationBlockBase {
  id: string;
  type: ConversationBlockType;
}

export interface MarkdownConversationBlock extends ConversationBlockBase {
  type: 'markdown';
  text: string;
}

export interface PlanConversationBlock extends ConversationBlockBase {
  type: 'plan';
  title: string;
  items: {
    id: string;
    title: string;
    detail?: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
  }[];
}

export interface ToolCallConversationBlock extends ConversationBlockBase {
  type: 'tool-call';
  toolName: string;
  summary: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface ApprovalConversationBlock extends ConversationBlockBase {
  type: 'approval';
  title: string;
  riskLevel: RiskLevel;
  summary: string;
}

export interface PatchSummaryConversationBlock extends ConversationBlockBase {
  type: 'patch-summary';
  patchSetId: string;
  summary: string;
  fileCount: number;
  hunkCount: number;
}

export interface ValidationResultConversationBlock extends ConversationBlockBase {
  type: 'validation-result';
  summary: string;
  status: 'passed' | 'failed' | 'skipped';
  diagnostics: DiagnosticSummary[];
}

export interface FinalSummaryConversationBlock extends ConversationBlockBase {
  type: 'final-summary';
  summary: string;
}

export type ConversationBlock =
  | MarkdownConversationBlock
  | PlanConversationBlock
  | ToolCallConversationBlock
  | ApprovalConversationBlock
  | PatchSummaryConversationBlock
  | ValidationResultConversationBlock
  | FinalSummaryConversationBlock
  | ExecutionStepConversationBlock
  | ExecutionSummaryConversationBlock
  | CommandOutputConversationBlock;

export interface ConversationSessionRecord {
  id: string;
  workspaceId: string;
  title: string;
  status: 'active' | 'archived';
  isPinned: boolean;
  pinnedOrder: number;
  unpinnedOrder: number;
  manualUnread: boolean;
  lastReadAt?: number;
  archivedAt?: number;
  titleUpdatedAt?: number;
  createdAt: number;
  updatedAt: number;
  lastMessageAt: number;
}

export type SidebarOrderBucket = 'pinned' | 'unpinned';

export interface ReorderWorkspacesInput {
  pinnedIds: string[];
  unpinnedIds: string[];
}

export interface ReorderSessionsInput {
  workspaceId: string;
  pinnedIds: string[];
  unpinnedIds: string[];
}

export interface ConversationMessageRecord {
  id: string;
  sessionId: string;
  role: ConversationRole;
  content: string;
  blocks: ConversationBlock[];
  runId?: string;
  createdAt: number;
}

export interface ConversationDetail {
  session: ConversationSessionRecord;
  messages: ConversationMessageRecord[];
}

export interface ConversationSendResult {
  session: ConversationSessionRecord;
  userMessage: ConversationMessageRecord;
  assistantMessage: ConversationMessageRecord;
  runDetail: AgentRunDetail;
  patchSet?: PatchSet;
}

export type ConversationScenario = 'chat' | 'plan' | 'code-edit';
