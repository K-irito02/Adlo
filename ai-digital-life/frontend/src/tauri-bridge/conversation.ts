import type { ConversationBridge } from '../shared/ipc';
import type {
  AgentRunDetail,
  ConversationDetail,
  ConversationSendResult,
  ConversationSessionRecord,
  ReorderSessionsInput,
} from '@ai-digital-life/kernel';
import { invokeIpc } from './shared';

export function createTauriConversationBridge(): ConversationBridge {
  return {
    createSession: (title?: string, workspaceId?: string) =>
      invokeIpc<ConversationSessionRecord>('conversation_create_session', { title, workspaceId }),
    listSessions: () => invokeIpc<ConversationSessionRecord[]>('conversation_list_sessions'),
    getSession: (sessionId: string) =>
      invokeIpc<ConversationDetail | undefined>('conversation_get_session', { sessionId }),
    renameSession: (input: { sessionId: string; title: string }) =>
      invokeIpc<ConversationSessionRecord>('conversation_rename_session', { input }),
    pinSession: (sessionId: string) =>
      invokeIpc<ConversationSessionRecord>('conversation_pin_session', { sessionId }),
    unpinSession: (sessionId: string) =>
      invokeIpc<ConversationSessionRecord>('conversation_unpin_session', { sessionId }),
    reorderSessions: (input: ReorderSessionsInput) =>
      invokeIpc<ConversationSessionRecord[]>('conversation_reorder_sessions', { input }),
    markSessionRead: (input: { sessionId: string; readAt?: number }) =>
      invokeIpc<ConversationSessionRecord>('conversation_mark_session_read', { input }),
    markSessionUnread: (sessionId: string) =>
      invokeIpc<ConversationSessionRecord>('conversation_mark_session_unread', { sessionId }),
    archiveSession: (sessionId: string) =>
      invokeIpc<ConversationSessionRecord>('conversation_archive_session', { sessionId }),
    archiveAllInWorkspace: () =>
      invokeIpc<ConversationSessionRecord[]>('conversation_archive_all_in_workspace'),
    deleteSession: (sessionId: string) =>
      invokeIpc<boolean>('conversation_delete_session', { sessionId }),
    sendMessage: (input: {
      sessionId: string;
      content: string;
      scenario?: 'chat' | 'plan' | 'code-edit';
      providerId?: string;
      modelId?: string;
    }) => invokeIpc<ConversationSendResult>('conversation_send_message', { input }),
    cancelMessage: (runId: string) =>
      invokeIpc<AgentRunDetail | undefined>('conversation_cancel_message', { runId }),
  };
}
