import type { PtyBridge, PtySessionInfo } from '../shared/ipc/pty';
import { invokeIpc } from './tauri-shared';

export function createTauriPtyBridge(): PtyBridge {
  return {
    create: (input: { shell?: string; cwd?: string; cols: number; rows: number }) =>
      invokeIpc<{ sessionId: string }>('pty_create', { input }),
    input: (sessionId: string, data: string) =>
      invokeIpc<boolean>('pty_input', { sessionId, data }),
    resize: (sessionId: string, cols: number, rows: number) =>
      invokeIpc<boolean>('pty_resize', { sessionId, cols, rows }),
    kill: (sessionId: string) => invokeIpc<boolean>('pty_kill', { sessionId }),
    list: () => invokeIpc<PtySessionInfo[]>('pty_list'),
  };
}
