import type { StoreState } from '../StoreState';
import type { IpcResult, ReorderSessionsInput } from '@ai-digital-life/kernel';
import { sessionFallbackTitle, refreshConversationSlice } from '../conversationUtils';
import { getNextSessionRequestSeq, sessionRequestSeq } from '../shared';
import type { StoreApi } from 'zustand';

async function sessionMutate<T>(
  get: () => StoreState,
  set: StoreApi<StoreState>['setState'],
  sessionId: string,
  ipcCall: (sessionId: string) => Promise<IpcResult<T>>
) {
  const result = await ipcCall(sessionId);
  if (!result.ok) {
    set({ error: result.error.message });
    return;
  }
  const conversationState = await refreshConversationSlice(get().activeSessionId);
  set((state: StoreState) => ({
    sessions: conversationState.sessions,
    ...(conversationState.detail
      ? { sessionDetails: { ...state.sessionDetails, [sessionId]: conversationState.detail } }
      : {}),
  }));
}

export function createSessionActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  return {
    /**
     * [createSession - 创建新的会话]
     * @reads workspaceSlice.appInfo
     * @writes sessionSlice.sessions, sessionSlice.activeSessionId, sessionSlice.sessionDetails
     * @see shared/ipc.ts → conversation.createSession
     * @see mock-bridge.ts → conversation.createSession
     * @see preview-bridge/index.ts → conversation.createSession
     */
    createSession: async (workspaceId?: string) => {
      const result = await window.digitalLife.conversation.createSession(
        sessionFallbackTitle(get().appInfo),
        workspaceId
      );
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      const conversationState = await refreshConversationSlice(result.data.id);
      set((state: StoreState) => ({
        sessions: conversationState.sessions,
        activeSessionId: conversationState.activeSessionId,
        sessionDetails: conversationState.detail
          ? {
              ...state.sessionDetails,
              [conversationState.detail.session.id]: conversationState.detail,
            }
          : state.sessionDetails,
      }));
    },

    /**
     * [switchToWorkspace - 切换到指定工作区的会话（如有最近会话则切换，否则新建）]
     * @reads sessionSlice.sessions
     * @writes (通过 selectSession/createSession) sessionSlice.sessions, sessionSlice.activeSessionId, sessionSlice.sessionDetails
     * @see shared/ipc.ts → conversation.createSession (通过 createSession)
     * @see mock-bridge.ts → conversation.createSession (通过 createSession)
     * @see preview-bridge/index.ts → conversation.createSession (通过 createSession)
     */
    switchToWorkspace: async (workspaceId: string, _workspacePath: string) => {
      const state = get();
      const workspaceSessions = state.sessions.filter(
        (s) => s.workspaceId === workspaceId && !s.archivedAt
      );

      if (workspaceSessions.length > 0) {
        const recentSession = [...workspaceSessions].sort(
          (a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0)
        )[0];
        await get().selectSession(recentSession.id);
      } else {
        await get().createSession(workspaceId);
      }
    },

    /**
     * [selectSession - 选择并标记会话为已读]
     * @writes sessionSlice.activeSessionId, sessionSlice.sessions, sessionSlice.sessionDetails
     * @see shared/ipc.ts → conversation.markSessionRead
     * @see mock-bridge.ts → conversation.markSessionRead
     * @see preview-bridge/index.ts → conversation.markSessionRead
     */
    selectSession: async (sessionId: string) => {
      const requestSeq = getNextSessionRequestSeq();
      set({ activeSessionId: sessionId, error: undefined });
      const markReadResult = await window.digitalLife.conversation.markSessionRead({ sessionId });
      if (requestSeq !== sessionRequestSeq) return;
      if (!markReadResult.ok) {
        set({ error: markReadResult.error.message });
        return;
      }
      const conversationState = await refreshConversationSlice(sessionId);
      if (requestSeq !== sessionRequestSeq) return;
      set((state: StoreState) => ({
        sessions: conversationState.sessions,
        activeSessionId: conversationState.activeSessionId,
        sessionDetails: conversationState.detail
          ? {
              ...state.sessionDetails,
              [sessionId]: conversationState.detail,
            }
          : state.sessionDetails,
      }));
    },

    /**
     * [renameSession - 重命名指定会话]
     * @reads sessionSlice.sessionDetails
     * @writes sessionSlice.sessions, sessionSlice.sessionDetails
     * @see shared/ipc.ts → conversation.renameSession
     * @see mock-bridge.ts → conversation.renameSession
     * @see preview-bridge/index.ts → conversation.renameSession
     */
    renameSession: async (sessionId: string, title: string) => {
      const result = await window.digitalLife.conversation.renameSession({
        sessionId,
        title,
      });
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      await refreshConversationSlice(get().activeSessionId ?? sessionId);
      set((state: StoreState) => ({
        sessions: state.sessions,
        sessionDetails: state.sessionDetails[sessionId]
          ? {
              ...state.sessionDetails,
              [sessionId]: {
                ...state.sessionDetails[sessionId],
                session: result.data,
              },
            }
          : state.sessionDetails,
      }));
    },

    /**
     * [pinSession - 置顶会话]
     * @writes sessionSlice.sessions, sessionSlice.sessionDetails (通过 sessionMutate)
     * @see shared/ipc.ts → conversation.pinSession
     * @see mock-bridge.ts → conversation.pinSession
     * @see preview-bridge/index.ts → conversation.pinSession
     */
    pinSession: async (sessionId: string) => {
      await sessionMutate(get, set, sessionId, (id) =>
        window.digitalLife.conversation.pinSession(id)
      );
    },

    /**
     * [unpinSession - 取消置顶会话]
     * @writes sessionSlice.sessions, sessionSlice.sessionDetails (通过 sessionMutate)
     * @see shared/ipc.ts → conversation.unpinSession
     * @see mock-bridge.ts → conversation.unpinSession
     * @see preview-bridge/index.ts → conversation.unpinSession
     */
    unpinSession: async (sessionId: string) => {
      await sessionMutate(get, set, sessionId, (id) =>
        window.digitalLife.conversation.unpinSession(id)
      );
    },

    /**
     * [markSessionRead - 标记会话为已读]
     * @writes sessionSlice.sessions, sessionSlice.sessionDetails (通过 sessionMutate)
     * @see shared/ipc.ts → conversation.markSessionRead
     * @see mock-bridge.ts → conversation.markSessionRead
     * @see preview-bridge/index.ts → conversation.markSessionRead
     */
    markSessionRead: async (sessionId: string) => {
      await sessionMutate(get, set, sessionId, (id) =>
        window.digitalLife.conversation.markSessionRead({ sessionId: id })
      );
    },

    /**
     * [markSessionUnread - 标记会话为未读]
     * @writes sessionSlice.sessions, sessionSlice.sessionDetails (通过 sessionMutate)
     * @see shared/ipc.ts → conversation.markSessionUnread
     * @see mock-bridge.ts → conversation.markSessionUnread
     * @see preview-bridge/index.ts → conversation.markSessionUnread
     */
    markSessionUnread: async (sessionId: string) => {
      await sessionMutate(get, set, sessionId, (id) =>
        window.digitalLife.conversation.markSessionUnread(id)
      );
    },

    /**
     * [archiveSession - 归档会话]
     * @writes sessionSlice.sessions, sessionSlice.sessionDetails (通过 sessionMutate)
     * @see shared/ipc.ts → conversation.archiveSession
     * @see mock-bridge.ts → conversation.archiveSession
     * @see preview-bridge/index.ts → conversation.archiveSession
     */
    archiveSession: async (sessionId: string) => {
      await sessionMutate(get, set, sessionId, (id) =>
        window.digitalLife.conversation.archiveSession(id)
      );
    },

    /**
     * [archiveAllSessions - 归档当前工作区所有会话]
     * @reads sessionSlice.activeSessionId
     * @writes sessionSlice.sessions
     * @see shared/ipc.ts → conversation.archiveAllInWorkspace
     * @see mock-bridge.ts → conversation.archiveAllInWorkspace
     * @see preview-bridge/index.ts → conversation.archiveAllInWorkspace
     */
    archiveAllSessions: async () => {
      const result = await window.digitalLife.conversation.archiveAllInWorkspace();
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      const conversationState = await refreshConversationSlice(get().activeSessionId);
      set({ sessions: conversationState.sessions });
    },

    /**
     * [deleteSession - 删除会话]
     * @writes sessionSlice.sessions, sessionSlice.sessionDetails (通过 sessionMutate)
     * @see shared/ipc.ts → conversation.deleteSession
     * @see mock-bridge.ts → conversation.deleteSession
     * @see preview-bridge/index.ts → conversation.deleteSession
     */
    deleteSession: async (sessionId: string) => {
      await sessionMutate(get, set, sessionId, (id) =>
        window.digitalLife.conversation.deleteSession(id)
      );
    },

    /**
     * [reorderSessions - 重新排序会话列表]
     * @writes sessionSlice.sessions
     * @see shared/ipc.ts → conversation.reorderSessions
     * @see mock-bridge.ts → conversation.reorderSessions
     * @see preview-bridge/index.ts → conversation.reorderSessions
     */
    reorderSessions: async (input: ReorderSessionsInput) => {
      const result = await window.digitalLife.conversation.reorderSessions(input);
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      set({ sessions: result.data });
    },

    /**
     * [markAllSessionsRead - 批量标记会话为已读]
     * @reads sessionSlice.activeSessionId
     * @writes sessionSlice.sessions
     * @see shared/ipc.ts → conversation.markSessionRead
     * @see mock-bridge.ts → conversation.markSessionRead
     * @see preview-bridge/index.ts → conversation.markSessionRead
     */
    markAllSessionsRead: async (sessionIds: string[]) => {
      const results = await Promise.all(
        sessionIds.map((sessionId) =>
          window.digitalLife.conversation.markSessionRead({ sessionId })
        )
      );
      const failure = results.find((result) => !result.ok);
      if (failure && !failure.ok) {
        set({ error: failure.error.message });
        return;
      }
      const conversationState = await refreshConversationSlice(get().activeSessionId);
      set({ sessions: conversationState.sessions });
    },
  };
}
