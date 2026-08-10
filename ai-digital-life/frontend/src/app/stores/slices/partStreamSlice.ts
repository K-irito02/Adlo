import type { StoreState } from '../StoreState';
import type {
  PartState,
  SessionPartState,
  SseWireEvent,
} from '../../features/part-stream/partStoreTypes';
import type { SessionMessagesPayload } from '../../../kernel/types-part';
import {
  createInitialPartState,
  hydratePartHistory,
  reducePartEvent,
  selectSessionMessages,
} from '../../features/part-stream/PartStore';

export interface PartStreamSlice {
  /** Per-session part-render state (messages + parts + status + questions). */
  partBySession: PartState;
  /** Load a session's message+part history into the store. */
  partHydrate: (sessionId: string, payload: SessionMessagesPayload) => void;
  /** Fold a raw SSE wire event into the session's part state (sessionID forced
   *  to the hook's sessionId so a stray wire event never lands elsewhere). */
  partApplyEvent: (sessionId: string, event: SseWireEvent) => void;
  /** Read a session's full part-render state (messages + parts + status). */
  partSelect: (sessionId: string) => SessionPartState;
  /** Force a session.status (e.g. on leave/error). */
  partSetStatus: (sessionId: string, status: SessionPartState['status']) => void;
}

export const createPartStreamSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState,
): PartStreamSlice => ({
  partBySession: createInitialPartState(),

  partHydrate: (sessionId, payload) =>
    set((s) => ({ partBySession: hydratePartHistory(s.partBySession, sessionId, payload) })),

  partApplyEvent: (sessionId, event) =>
    set((s) => ({
      partBySession: reducePartEvent(s.partBySession, { ...event, sessionID: sessionId }),
    })),

  partSelect: (sessionId) => selectSessionMessages(get().partBySession, sessionId),

  partSetStatus: (sessionId, status) =>
    set((s) => ({
      partBySession: reducePartEvent(s.partBySession, {
        type: 'session.status',
        sessionID: sessionId,
        status,
      }),
    })),
});
