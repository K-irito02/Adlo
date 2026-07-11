import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';
import type { PluginInfo } from '@shared/ipc';
import { clearError, captureTypedError } from '../shared';

export function createPluginActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  return {
    listPlugins: async () => {
      clearError(get);
      const result = await window.digitalLife.plugin.listPlugins();
      if (!result.ok) {
        captureTypedError(get, result.error);
        return [] as PluginInfo[];
      }
      return result.data;
    },

    setPluginEnabled: async (name: string, enabled: boolean) => {
      clearError(get);
      const result = await window.digitalLife.plugin.setPluginEnabled(name, enabled);
      if (!result.ok) {
        captureTypedError(get, result.error);
      }
    },
  };
}
