import type { StoreState } from "../StoreState";
import type { ReorderSessionsInput } from "@ai-digital-life/kernel";
import { sessionFallbackTitle, refreshConversationSlice } from "../conversationUtils";
import {
  getNextSessionRequestSeq,
  sessionRequestSeq,
} from "../shared";

export function createSessionActions(set: any, get: () => StoreState) {
  return {
    createSession: async () => {
      const result = await window.digitalLife.conversation.createSession(
        sessionFallbackTitle(get().appInfo)
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

    selectSession: async (sessionId: string) => {
      const requestSeq = getNextSessionRequestSeq();
      set({ activeSessionId: sessionId, error: undefined });
      const markReadResult = await window.digitalLife.conversation.markSessionRead(
        { sessionId }
      );
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
      const result = await window.digitalLife.conversation.pinSession(sessionId);
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      const conversationState = await refreshConversationSlice(
        get().activeSessionId ?? sessionId
      );
      set({ sessions: conversationState.sessions });
    },

    unpinSession: async (sessionId: string) => {
      const result = await window.digitalLife.conversation.unpinSession(
        sessionId
      );
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      const conversationState = await refreshConversationSlice(
        get().activeSessionId ?? sessionId
      );
      set({ sessions: conversationState.sessions });
    },

    markSessionRead: async (sessionId: string) => {
      const result = await window.digitalLife.conversation.markSessionRead({
        sessionId,
      });
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      const conversationState = await refreshConversationSlice(
        get().activeSessionId ?? sessionId
      );
      set({ sessions: conversationState.sessions });
    },

    markSessionUnread: async (sessionId: string) => {
      const result = await window.digitalLife.conversation.markSessionUnread(
        sessionId
      );
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      const conversationState = await refreshConversationSlice(
        get().activeSessionId ?? sessionId
      );
      set({ sessions: conversationState.sessions });
    },

    archiveSession: async (sessionId: string) => {
      const result = await window.digitalLife.conversation.archiveSession(
        sessionId
      );
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      const conversationState = await refreshConversationSlice(
        get().activeSessionId
      );
      set({ sessions: conversationState.sessions });
    },

    archiveAllSessions: async () => {
      const result =
        await window.digitalLife.conversation.archiveAllInWorkspace();
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      const conversationState = await refreshConversationSlice(
        get().activeSessionId
      );
      set({ sessions: conversationState.sessions });
    },

    deleteSession: async (sessionId: string) => {
      const result = await window.digitalLife.conversation.deleteSession(
        sessionId
      );
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      const conversationState = await refreshConversationSlice(
        get().activeSessionId === sessionId ? undefined : get().activeSessionId
      );
      set((state: StoreState) => {
        const nextDetails = { ...state.sessionDetails };
        delete nextDetails[sessionId];
        return {
          sessions: conversationState.sessions,
          activeSessionId: conversationState.activeSessionId,
          sessionDetails: nextDetails,
        };
      });
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
      const conversationState = await refreshConversationSlice(
        get().activeSessionId
      );
      set({ sessions: conversationState.sessions });
    },
  };
}
