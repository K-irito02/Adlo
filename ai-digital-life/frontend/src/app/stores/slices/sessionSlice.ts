/**
 * 会话切片
 * 管理会话列表、活跃会话、流式输出等状态
 */
import type {
  ConversationDetail,
  ConversationSessionRecord,
  AgentRunDetail,
  ModelTokenUsage,
  DigitalLifeRunActivityEventV1,
} from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';
import { trimOldRuns, trimActivityList } from '../activityUtils';

const STREAMING_BUFFER_MAX_BYTES = 10_240;

export interface SessionSlice {
  sessions: ConversationSessionRecord[];
  activeSessionId?: string;
  sessionDetails: Record<string, ConversationDetail>;
  activeRun?: AgentRunDetail;
  streamingAssistantText: string;
  streamingActiveRunId?: string;
  runActivityByRunId: Record<string, DigitalLifeRunActivityEventV1[]>;
  runUsageByRunId: Record<string, ModelTokenUsage | undefined>;
  _runLastAccessTime: Record<string, number>;

  setSessions: (sessions: ConversationSessionRecord[]) => void;
  setActiveSessionId: (sessionId: string | undefined) => void;
  setSessionDetail: (sessionId: string, detail: ConversationDetail) => void;
  setSessionDetails: (details: Record<string, ConversationDetail>) => void;
  removeSessionDetail: (sessionId: string) => void;
  setActiveRun: (run: AgentRunDetail | undefined) => void;
  setStreamingText: (text: string) => void;
  appendStreamingText: (text: string) => void;
  flushStreamingText: () => void;
  setStreamingRunId: (runId: string | undefined) => void;
  setRunActivity: (runId: string, activities: DigitalLifeRunActivityEventV1[]) => void;
  appendRunActivity: (runId: string, activity: DigitalLifeRunActivityEventV1) => void;
  setRunUsage: (runId: string, usage: ModelTokenUsage | undefined) => void;
  clearStreaming: () => void;
}

export const createSessionSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): SessionSlice => {
  let _streamingRafPending = false;
  let _streamingBuffer = '';

  return {
    sessions: [],
    sessionDetails: {},
    streamingAssistantText: '',
    runActivityByRunId: {},
    runUsageByRunId: {},
    _runLastAccessTime: {},

    setSessions: (sessions) => set({ sessions }),
    setActiveSessionId: (activeSessionId) => set({ activeSessionId }),
    setSessionDetail: (sessionId, detail) =>
      set((state) => ({
        sessionDetails: { ...state.sessionDetails, [sessionId]: detail },
      })),
    setSessionDetails: (details) =>
      set((state) => ({
        sessionDetails: { ...state.sessionDetails, ...details },
      })),
    removeSessionDetail: (sessionId) =>
      set((state) => {
        const next = { ...state.sessionDetails };
        delete next[sessionId];
        return { sessionDetails: next };
      }),
    setActiveRun: (activeRun) => set({ activeRun }),
    setStreamingText: (streamingAssistantText) => set({ streamingAssistantText }),
    appendStreamingText: (text) => {
      _streamingBuffer += text;
      if (_streamingBuffer.length > STREAMING_BUFFER_MAX_BYTES) {
        const batch = _streamingBuffer;
        _streamingBuffer = '';
        _streamingRafPending = false;
        set((state) => ({
          streamingAssistantText: state.streamingAssistantText + batch,
        }));
        return;
      }
      if (!_streamingRafPending) {
        _streamingRafPending = true;
        requestAnimationFrame(() => {
          _streamingRafPending = false;
          const batch = _streamingBuffer;
          _streamingBuffer = '';
          if (batch) {
            set((state) => ({
              streamingAssistantText: state.streamingAssistantText + batch,
            }));
          }
        });
      }
    },
    flushStreamingText: () => {
      if (_streamingBuffer) {
        const batch = _streamingBuffer;
        _streamingBuffer = '';
        _streamingRafPending = false;
        set((state) => ({
          streamingAssistantText: state.streamingAssistantText + batch,
        }));
      }
    },
    setStreamingRunId: (streamingActiveRunId) => set({ streamingActiveRunId }),
    setRunActivity: (runId, activities) =>
      set((state) => {
        const now = Date.now();
        const trimmed = trimActivityList(activities);
        const excludeSet = new Set<string>();
        if (state.streamingActiveRunId) {
          excludeSet.add(state.streamingActiveRunId);
        }

        const trimmedMaps = trimOldRuns(
          { ...state.runActivityByRunId, [runId]: trimmed },
          state.runUsageByRunId,
          { ...state._runLastAccessTime, [runId]: now },
          excludeSet
        );

        return trimmedMaps;
      }),
    appendRunActivity: (runId, activity) =>
      set((state) => {
        const now = Date.now();
        const existing = state.runActivityByRunId[runId] ?? [];
        const next = trimActivityList([...existing, activity]);
        const excludeSet = new Set<string>();
        if (state.streamingActiveRunId) {
          excludeSet.add(state.streamingActiveRunId);
        }

        const trimmedMaps = trimOldRuns(
          { ...state.runActivityByRunId, [runId]: next },
          state.runUsageByRunId,
          { ...state._runLastAccessTime, [runId]: now },
          excludeSet
        );

        return trimmedMaps;
      }),
    setRunUsage: (runId, usage) =>
      set((state) => {
        const now = Date.now();
        const excludeSet = new Set<string>();
        if (state.streamingActiveRunId) {
          excludeSet.add(state.streamingActiveRunId);
        }

        const trimmedMaps = trimOldRuns(
          state.runActivityByRunId,
          { ...state.runUsageByRunId, [runId]: usage },
          { ...state._runLastAccessTime, [runId]: now },
          excludeSet
        );

        return trimmedMaps;
      }),
    clearStreaming: () => set({ streamingAssistantText: '', streamingActiveRunId: undefined }),
  };
};
