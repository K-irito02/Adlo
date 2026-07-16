import type { CommandConfig, CommandsConfigBridge } from '../shared/ipc';
import { invokeIpc } from './tauri-shared';

export function createTauriCommandsConfigBridge() {
  return {
    listCustomCommands: (dataDir) =>
      invokeIpc<CommandConfig[]>('list_custom_commands', { dataDir }),
    addCustomCommand: (dataDir, command) =>
      invokeIpc<CommandConfig[]>('add_custom_command', { dataDir, command }),
    updateCustomCommand: (dataDir, name, command) =>
      invokeIpc<CommandConfig[]>('update_custom_command', { dataDir, name, command }),
    deleteCustomCommand: (dataDir, name) =>
      invokeIpc<CommandConfig[]>('delete_custom_command', { dataDir, name }),
    renderCommandTemplate: (template, args, workspace) =>
      invokeIpc<string>('render_command_template', { template, args, workspace }),
  } satisfies CommandsConfigBridge;
}
