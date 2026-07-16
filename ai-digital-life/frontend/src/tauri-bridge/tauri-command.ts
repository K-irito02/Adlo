import type { CommandBridge } from '../shared/ipc';
import type { CommandRequest, CommandRunResult } from '@ai-digital-life/kernel';
import { invokeIpc } from './tauri-shared';

export function createTauriCommandBridge(): CommandBridge {
  return {
    run: (input: { command: string; args: string[]; shell?: boolean }) =>
      invokeIpc<CommandRunResult>('command_run', { input }),
    listRecent: (limit?: number) => invokeIpc<CommandRequest[]>('command_list_recent', { limit }),
  };
}
