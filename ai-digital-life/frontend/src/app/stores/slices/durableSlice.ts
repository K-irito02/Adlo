import type { DurableStatus } from '@shared/ipc/durable';
import type { StoreState } from '../StoreState';

export interface DurableSlice {
  durableSessions: Record<string, DurableSessionInfo>;
  setDurableSession: (sessionId: string, info: DurableSessionInfo) => void;
}

export interface DurableSessionInfo {
  sessionId: string;
  runId: string;
  status: DurableStatus;
  lastHeartbeat: number;
}

export const createDurableSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): DurableSlice => ({
  durableSessions: {},
  setDurableSession: (sessionId, info) =>
    set((s) => ({ durableSessions: { ...s.durableSessions, [sessionId]: info } })),
});
