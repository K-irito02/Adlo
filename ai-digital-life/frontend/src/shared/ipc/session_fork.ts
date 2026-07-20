import type { IpcResult } from '@ai-digital-life/kernel';
import type { ConversationSessionRecord } from '@ai-digital-life/kernel';

export type { ConversationSessionRecord, IpcResult };

export interface SessionForkBridge {
  forkSession(
    parentSession: ConversationSessionRecord,
    forkMessageId: string,
  ): Promise<IpcResult<ConversationSessionRecord>>;
  listSessionForks(
    workspaceId: string,
    parentSessionId: string,
  ): Promise<IpcResult<ConversationSessionRecord[]>>;
}
