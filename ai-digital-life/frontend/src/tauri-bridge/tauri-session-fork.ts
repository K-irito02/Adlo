import type { SessionForkBridge } from '../shared/ipc/session_fork';
import type { ConversationSessionRecord } from '@ai-digital-life/kernel';
import { invokeIpc } from './tauri-shared';

export function createTauriSessionForkBridge() {
  return {
    forkSession: (parentSession, forkMessageId) =>
      invokeIpc<ConversationSessionRecord>('fork_session_cmd', { parentSession, forkMessageId }),
    listSessionForks: (workspaceId, parentSessionId) =>
      invokeIpc<ConversationSessionRecord[]>('list_session_forks', {
        workspaceId,
        parentSessionId,
      }),
  } satisfies SessionForkBridge;
}
