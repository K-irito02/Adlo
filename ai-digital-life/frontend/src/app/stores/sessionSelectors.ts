/**
 * 会话相关的选择器
 */

import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from './slicedStore';
import type { StoreState } from './StoreState';

export const sessionSelectors = {
  getSessions: (state: StoreState) => state.sessions,
  useSessions: () => useAppStore(useShallow((s) => s.sessions)),

  getActiveSessionId: (state: StoreState) => state.activeSessionId,
  useActiveSessionId: () => useAppStore((s) => s.activeSessionId),

  getActiveSession: (state: StoreState) => {
    const activeId = state.activeSessionId;
    if (!activeId) {
      return undefined;
    }
    return state.sessionDetails[activeId];
  },
  useActiveSession: () =>
    useAppStore(
      useShallow((s) => {
        if (!s.activeSessionId) {
          return undefined;
        }
        return s.sessionDetails[s.activeSessionId];
      }),
    ),

  getSessionDetails: (state: StoreState) => state.sessionDetails,
  useSessionDetails: () => useAppStore(useShallow((s) => s.sessionDetails)),

  getSessionCount: (state: StoreState) => state.sessions.length,
  useSessionCount: () => useAppStore((s) => s.sessions.length),

  hasSessions: (state: StoreState) => state.sessions.length > 0,
  useHasSessions: () => useAppStore((s) => s.sessions.length > 0),
};
