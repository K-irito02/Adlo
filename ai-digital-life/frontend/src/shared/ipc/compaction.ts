import type { IpcResult } from '@ai-digital-life/kernel';

export interface CompactionResult {
  preserved_tokens: number;
  pruned_count: number;
  pruned_tokens: number;
  summary_needed: boolean;
}

export interface CompactionStatus {
  active: boolean;
  pruned_count: number;
  last_compacted_at: number | null;
}

export interface CompactionBridge {
  compactSession(messagesJson: string, provider: string): Promise<IpcResult<CompactionResult>>;
}
