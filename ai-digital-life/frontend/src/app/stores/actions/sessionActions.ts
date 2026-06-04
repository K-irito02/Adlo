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

    switchToWorkspace: async (workspaceId: string, workspacePath: string) => {
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

    pinSession: async (sessionId: string) => {
      await sessionMutate(get, set, sessionId, (id) =>
        window.digitalLife.conversation.pinSession(id)
      );
    },

    unpinSession: async (sessionId: string) => {
      await sessionMutate(get, set, sessionId, (id) =>
        window.digitalLife.conversation.unpinSession(id)
      );
    },

    markSessionRead: async (sessionId: string) => {
      await sessionMutate(get, set, sessionId, (id) =>
        window.digitalLife.conversation.markSessionRead({ sessionId: id })
      );
    },

    markSessionUnread: async (sessionId: string) => {
      await sessionMutate(get, set, sessionId, (id) =>
        window.digitalLife.conversation.markSessionUnread(id)
      );
    },

    archiveSession: async (sessionId: string) => {
      await sessionMutate(get, set, sessionId, (id) =>
        window.digitalLife.conversation.archiveSession(id)
      );
    },

    archiveAllSessions: async () => {
      const result = await window.digitalLife.conversation.archiveAllInWorkspace();
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      const conversationState = await refreshConversationSlice(get().activeSessionId);
      set({ sessions: conversationState.sessions });
    },

    deleteSession: async (sessionId: string) => {
      await sessionMutate(get, set, sessionId, (id) =>
        window.digitalLife.conversation.deleteSession(id)
      );
    },

    reorderSessions: async (input: ReorderSessionsInput) => {
      const result = await window.digitalLife.conversation.reorderSessions(input);
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      set({ sessions: result.data });
    },

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
