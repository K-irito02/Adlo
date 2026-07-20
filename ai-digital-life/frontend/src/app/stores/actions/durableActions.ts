import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';

export function createDurableActions(
  set: StoreApi<StoreState>['setState'],
  _get: () => StoreState,
) {
  return {
    registerDurableSession: async (sessionId: string, runId: string) => {
      const result = await window.digitalLife.durable.registerDurableSession(sessionId, runId);
      if (result.ok) {
        set((s) => ({
          durableSessions: {
            ...s.durableSessions,
            [sessionId]: { sessionId, runId, status: 'running', lastHeartbeat: Date.now() },
          },
        }));
      }
    },
    durableHeartbeat: async (sessionId: string) => {
      const info = _get().durableSessions[sessionId];
      if (!info) {
        return;
      }
      const result = await window.digitalLife.durable.heartbeatDurableSession(sessionId);
      if (result.ok) {
        set((s) => ({
          durableSessions: {
            ...s.durableSessions,
            [sessionId]: { ...info, lastHeartbeat: Date.now() },
          },
        }));
      }
    },
  };
}
