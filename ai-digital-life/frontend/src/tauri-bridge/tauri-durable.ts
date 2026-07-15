import type { DurableBridge, DurableSessionState } from '../shared/ipc';
import { invokeIpc } from './tauri-shared';

export function createTauriDurableBridge(): DurableBridge {
  return {
    registerDurableSession: (sessionId, runId) =>
      invokeIpc<void>('register_durable_session', { sessionId, runId }),
    heartbeatDurableSession: (sessionId) =>
      invokeIpc<void>('heartbeat_durable_session', { sessionId }),
    findCrashedSessions: () => invokeIpc<DurableSessionState[]>('find_crashed_sessions'),
    recoverSession: (sessionId) => invokeIpc<boolean>('recover_session', { sessionId }),
  };
}
