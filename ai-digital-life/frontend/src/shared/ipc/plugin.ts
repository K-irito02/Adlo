import type { IpcResult } from '@ai-digital-life/kernel';

export interface PluginInfo {
  name: string;
  description: string;
  hooks: string[];
  enabled: boolean;
}

export interface PluginBridge {
  listPlugins(): Promise<IpcResult<PluginInfo[]>>;
  setPluginEnabled(name: string, enabled: boolean): Promise<IpcResult<void>>;
}
