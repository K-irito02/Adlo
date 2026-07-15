import type { CompactionBridge, CompactSessionResult } from '../shared/ipc';
import { invokeIpc } from './tauri-shared';

export function createTauriCompactionBridge(): CompactionBridge {
  return {
    compactSession: (input) => invokeIpc<CompactSessionResult>('compact_session_cmd', { input }),
  };
}
