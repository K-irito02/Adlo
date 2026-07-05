import type { IpcResult } from '@ai-digital-life/kernel';
import type { ConversationSessionRecord } from '@ai-digital-life/kernel';

export interface SessionForkBridge {
  forkSession(
    parentSession: ConversationSessionRecord,
    forkMessageId: string,
    existingForkCount: number
  ): Promise<IpcResult<ConversationSessionRecord>>;
  listSessionForks(
    workspaceId: string,
    parentSessionId: string
  ): Promise<IpcResult<ConversationSessionRecord[]>>;
}
