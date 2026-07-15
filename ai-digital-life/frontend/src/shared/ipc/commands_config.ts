import type { IpcResult } from '@ai-digital-life/kernel';

export type { IpcResult };

export interface CommandHint {
  variable: string;
  description: string;
  required: boolean;
}

export interface CommandConfig {
  name: string;
  description: string;
  agent: string;
  model: string | null;
  template: string;
  subtask: boolean;
  hints: CommandHint[];
}

export interface CommandsConfigBridge {
  listCustomCommands(dataDir: string): Promise<IpcResult<CommandConfig[]>>;
  addCustomCommand(dataDir: string, command: CommandConfig): Promise<IpcResult<CommandConfig[]>>;
  updateCustomCommand(
    dataDir: string,
    name: string,
    command: CommandConfig
  ): Promise<IpcResult<CommandConfig[]>>;
  deleteCustomCommand(dataDir: string, name: string): Promise<IpcResult<CommandConfig[]>>;
  renderCommandTemplate(
    template: string,
    args: string[],
    workspace: string
  ): Promise<IpcResult<string>>;
}
