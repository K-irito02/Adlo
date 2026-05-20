/**
 * Session Store - 会话状态管理
 * 
 * 这是一个独立的 Zustand store，专注于会话相关的状态。
 * 管理会话列表、活跃会话、消息等。
 */

import { create } from "zustand";
import type {
  ConversationDetail,
  ConversationSessionRecord,
  ReorderSessionsInput,
  AgentRunDetail,
  ModelTokenUsage,
  DigitalLifeRunActivityEventV1,
} from "@ai-digital-life/kernel";
import {
  sessionRequestSeq,
  getNextSessionRequestSeq,
} from "./shared";

export type SessionState = {
  // State
  sessions: ConversationSessionRecord[];
  activeSessionId?: string;
  sessionDetails: Record<string, ConversationDetail>;
  activeRun?: AgentRunDetail;
  streamingAssistantText: string;
  streamingActiveRunId?: string;
  runActivityByRunId: Record<string, DigitalLifeRunActivityEventV1[]>;
  runUsageByRunId: Record<string, ModelTokenUsage | undefined>;
  
  // Actions
  setSessions: (sessions: ConversationSessionRecord[]) => void;
  setActiveSessionId: (sessionId: string | undefined) => void;
  setSessionDetail: (sessionId: string, detail: ConversationDetail) => void;
  setActiveRun: (run: AgentRunDetail | undefined) => void;
  setStreamingText: (text: string) => void;
  setStreamingRunId: (runId: string | undefined) => void;
  setRunActivity: (runId: string, activities: DigitalLifeRunActivityEventV1[]) => void;
  setRunUsage: (runId: string, usage: ModelTokenUsage | undefined) => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  // Initial state
  sessions: [],
  sessionDetails: {},
  streamingAssistantText: "",
  runActivityByRunId: {},
  runUsageByRunId: {},

  // Actions
  setSessions: (sessions) => set({ sessions }),
  setActiveSessionId: (activeSessionId) => set({ activeSessionId }),
  setSessionDetail: (sessionId, detail) => set((state) => ({
    sessionDetails: { ...state.sessionDetails, [sessionId]: detail }
  })),
  setActiveRun: (activeRun) => set({ activeRun }),
  setStreamingText: (streamingAssistantText) => set({ streamingAssistantText }),
  setStreamingRunId: (streamingActiveRunId) => set({ streamingActiveRunId }),
  setRunActivity: (runId, activities) => set((state) => ({
    runActivityByRunId: { ...state.runActivityByRunId, [runId]: activities }
  })),
  setRunUsage: (runId, usage) => set((state) => ({
    runUsageByRunId: { ...state.runUsageByRunId, [runId]: usage }
  })),
}));

// Session-related actions that interact with the backend
export const sessionActions = {
  createSession: async (title: string) => {
    const result = await window.digitalLife.conversation.createSession(title);
    return result;
  },

  selectSession: async (
    sessionId: string, 
    setState: (partial: Partial<SessionState> | ((prev: SessionState) => Partial<SessionState>)) => void
  ) => {
    const currentSeq = getNextSessionRequestSeq();
    
    // Use function form for setState to get current state
    setState((prev: SessionState) => ({ activeSessionId: sessionId }));
    
    // Mark as read
    await window.digitalLife.conversation.markSessionRead({ sessionId });
    
    if (currentSeq !== sessionRequestSeq) {
      return;
    }

    // Load session detail
    const detailResult = await window.digitalLife.conversation.getSession(sessionId);
    if (currentSeq !== sessionRequestSeq) {
      return;
    }

    if (detailResult.ok && detailResult.data) {
      setState((prev: SessionState) => ({
        sessionDetails: { ...prev.sessionDetails, [sessionId]: detailResult.data! }
      }));
    }
  },

  renameSession: async (sessionId: string, title: string) => {
    return await window.digitalLife.conversation.renameSession({ sessionId, title });
  },

  pinSession: async (sessionId: string) => {
    return await window.digitalLife.conversation.pinSession(sessionId);
  },

  unpinSession: async (sessionId: string) => {
    return await window.digitalLife.conversation.unpinSession(sessionId);
  },

  markSessionRead: async (sessionId: string) => {
    return await window.digitalLife.conversation.markSessionRead({ sessionId });
  },

  markSessionUnread: async (sessionId: string) => {
    return await window.digitalLife.conversation.markSessionUnread(sessionId);
  },

  archiveSession: async (sessionId: string) => {
    return await window.digitalLife.conversation.archiveSession(sessionId);
  },

  archiveAllSessions: async () => {
    return await window.digitalLife.conversation.archiveAllInWorkspace();
  },

  deleteSession: async (sessionId: string) => {
    return await window.digitalLife.conversation.deleteSession(sessionId);
  },

  reorderSessions: async (input: ReorderSessionsInput) => {
    return await window.digitalLife.conversation.reorderSessions(input);
  },

  markAllSessionsRead: async (sessionIds: string[]) => {
    const results = await Promise.all(
      sessionIds.map((sessionId) => 
        window.digitalLife.conversation.markSessionRead({ sessionId })
      )
    );
    return results;
  },

  fetchRunActivity: async (runId: string, limit?: number) => {
    const result = await window.digitalLife.runActivity.listByRunId(runId, limit);
    return result;
  },

  // Streaming-related actions
  sendMessage: async (content: string, options?: any) => {
    const sendFn = window.digitalLife.conversation.sendMessage as any;
    if (sendFn.length >= 2) {
      return await sendFn(content, options);
    }
    return await sendFn(content);
  },

  cancelActiveStream: async () => {
    const cancelMsg = (window.digitalLife.conversation as any).cancelMessage;
    if (cancelMsg) {
      return await cancelMsg("");
    }
    return { ok: false, error: { code: "not_implemented", message: "cancelMessage not available" } };
  },
};

/**
 * Selectors for Session Store
 */
export const sessionSelectors = {
  /** Check if there are any sessions */
  hasSessions: (state: SessionState) => state.sessions.length > 0,
  
  /** Get session count */
  getSessionCount: (state: SessionState) => state.sessions.length,
  
  /** Get active session */
  getActiveSession: (state: SessionState) => {
    if (!state.activeSessionId) return undefined;
    return state.sessionDetails[state.activeSessionId];
  },
  
  /** Check if session is pinned */
  isSessionPinned: (sessionId: string) => (state: SessionState) => {
    const session = state.sessions.find(s => s.id === sessionId);
    return session?.isPinned ?? false;
  },
  
  /** Get pinned sessions */
  getPinnedSessions: (state: SessionState) => 
    state.sessions.filter(s => s.isPinned),
  
  /** Get recent sessions */
  getRecentSessions: (state: SessionState, limit: number = 10) => 
    [...state.sessions]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit),
  
  /** Check if streaming */
  isStreaming: (state: SessionState) => Boolean(state.streamingActiveRunId),
  
  /** Check if has active run */
  hasActiveRun: (state: SessionState) => Boolean(state.activeRun),
};
