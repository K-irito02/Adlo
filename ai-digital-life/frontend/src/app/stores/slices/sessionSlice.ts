/**
 * 会话切片
 * 管理会话列表、活跃会话、流式输出等状态
 */
import type {
  ConversationDetail,
  ConversationSessionRecord,
  AgentRunDetail,
  ModelTokenUsage,
  DigitalLifeRunActivityEventV1
} from "@ai-digital-life/kernel";
import type { StoreState } from "../StoreState";

export interface SessionSlice {
  sessions: ConversationSessionRecord[];
  activeSessionId?: string;
  sessionDetails: Record<string, ConversationDetail>;
  activeRun?: AgentRunDetail;
  streamingAssistantText: string;
  streamingActiveRunId?: string;
  runActivityByRunId: Record<string, DigitalLifeRunActivityEventV1[]>;
  runUsageByRunId: Record<string, ModelTokenUsage | undefined>;

  setSessions: (sessions: ConversationSessionRecord[]) => void;
  setActiveSessionId: (sessionId: string | undefined) => void;
  setSessionDetail: (sessionId: string, detail: ConversationDetail) => void;
  setSessionDetails: (details: Record<string, ConversationDetail>) => void;
  removeSessionDetail: (sessionId: string) => void;
  setActiveRun: (run: AgentRunDetail | undefined) => void;
  setStreamingText: (text: string) => void;
  appendStreamingText: (text: string) => void;
  setStreamingRunId: (runId: string | undefined) => void;
  setRunActivity: (runId: string, activities: DigitalLifeRunActivityEventV1[]) => void;
  appendRunActivity: (runId: string, activity: DigitalLifeRunActivityEventV1) => void;
  setRunUsage: (runId: string, usage: ModelTokenUsage | undefined) => void;
  clearStreaming: () => void;
}

export const createSessionSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState
): SessionSlice => ({
  sessions: [],
  sessionDetails: {},
  streamingAssistantText: "",
  runActivityByRunId: {},
  runUsageByRunId: {},

  setSessions: (sessions) => set({ sessions }),
  setActiveSessionId: (activeSessionId) => set({ activeSessionId }),
  setSessionDetail: (sessionId, detail) => set((state) => ({
    sessionDetails: { ...state.sessionDetails, [sessionId]: detail }
  })),
  setSessionDetails: (details) => set((state) => ({
    sessionDetails: { ...state.sessionDetails, ...details }
  })),
  removeSessionDetail: (sessionId) => set((state) => {
    const next = { ...state.sessionDetails };
    delete next[sessionId];
    return { sessionDetails: next };
  }),
  setActiveRun: (activeRun) => set({ activeRun }),
  setStreamingText: (streamingAssistantText) => set({ streamingAssistantText }),
  appendStreamingText: (text) => set((state) => ({
    streamingAssistantText: state.streamingAssistantText + text
  })),
  setStreamingRunId: (streamingActiveRunId) => set({ streamingActiveRunId }),
  setRunActivity: (runId, activities) => set((state) => ({
    runActivityByRunId: { ...state.runActivityByRunId, [runId]: activities }
  })),
  appendRunActivity: (runId, activity) => set((state) => {
    const existing = state.runActivityByRunId[runId] ?? [];
    const next = existing.length > 500 ? [...existing.slice(-400), activity] : [...existing, activity];
    return { runActivityByRunId: { ...state.runActivityByRunId, [runId]: next } };
  }),
  setRunUsage: (runId, usage) => set((state) => ({
    runUsageByRunId: { ...state.runUsageByRunId, [runId]: usage }
  })),
  clearStreaming: () => set({ streamingAssistantText: "", streamingActiveRunId: undefined })
});
