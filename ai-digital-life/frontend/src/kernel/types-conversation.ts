import type { RiskLevel } from './types-task';
import type { DiagnosticSummary } from './types-workspace-files';
import type {
  AgentRunDetail,
  ExecutionStepConversationBlock,
  ExecutionSummaryConversationBlock,
  CommandOutputConversationBlock,
} from './types-agent';
import type { PatchSet } from './types-patch';

// ════════════════════════════════════════════════════════
// Conversation Blocks
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
  items: Array<{
    id: string;
    title: string;
    detail?: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
  }>;
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

// ════════════════════════════════════════════════════════
// Conversation Session / Messages
// ════════════════════════════════════════════════════════

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
