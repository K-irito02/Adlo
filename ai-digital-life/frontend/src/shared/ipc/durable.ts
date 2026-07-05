import type { IpcResult } from '@ai-digital-life/kernel';

export type DurableStatus = 'running' | 'paused' | 'completed' | 'failed' | 'recovering';

export interface DurableSessionState {
  session_id: string;
  run_id: string;
  status: DurableStatus;
  checkpoint_message_id: string | null;
  last_heartbeat: number;
  retry_count: number;
}

export interface DurableBridge {
  registerDurableSession(sessionId: string, runId: string): Promise<IpcResult<void>>;
  heartbeatDurableSession(sessionId: string): Promise<IpcResult<void>>;
  findCrashedSessions(): Promise<IpcResult<DurableSessionState[]>>;
  recoverSession(sessionId: string): Promise<IpcResult<boolean>>;
}
