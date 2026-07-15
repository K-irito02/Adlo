import type {
  IpcResult,
  ConversationMessageRecord,
  ModelProviderId,
} from '@ai-digital-life/kernel';

export type { ConversationMessageRecord, IpcResult, ModelProviderId };

export interface CompactSessionInput {
  sessionId: string;
  messagesJson: string;
  previousSummary: string | null;
  provider: ModelProviderId | null;
}

export interface CompactSessionResult {
  preservedMessages: ConversationMessageRecord[];
  prunedCount: number;
  summary: string | null;
  summaryNeeded: boolean;
}

export interface CompactionStatus {
  active: boolean;
  pruned_count: number;
  last_compacted_at: number | null;
}

export interface CompactionBridge {
  compactSession(input: CompactSessionInput): Promise<IpcResult<CompactSessionResult>>;
}
