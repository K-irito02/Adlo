import type { PluginBridge, PluginInfo } from '../shared/ipc';
import { invokeIpc } from './shared';

export function createTauriPluginBridge(): PluginBridge {
  return {
    listPlugins: () => invokeIpc<PluginInfo[]>('list_plugins'),
    setPluginEnabled: (name: string, enabled: boolean) =>
      invokeIpc<void>('set_plugin_enabled', { name, enabled }),
    registerPlugin: (name, description, hooks) =>
      invokeIpc<void>('register_plugin', { name, description, hooks }),
    unregisterPlugin: (name) => invokeIpc<void>('unregister_plugin', { name }),
  };
}
