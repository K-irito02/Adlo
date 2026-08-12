import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';
import type { CommandConfig } from '@shared/ipc';
import { clearError, captureError } from '../shared';
const SCOPE = 'customCommand';

export function createCustomCommandActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
) {
  return {
    fetchCustomCommands: async (dataDir: string) => {
      set({ isFetchingCommands: true });
      clearError(get, SCOPE);
      const bridge = window.digitalLife;
      const result = await bridge.commandsConfig.listCustomCommands(dataDir);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        set({ isFetchingCommands: false });
        return;
      }
      set({ customCommands: result.data, isFetchingCommands: false });
    },

    addCustomCommand: async (dataDir: string, command: CommandConfig) => {
      clearError(get, SCOPE);
      const bridge = window.digitalLife;
      const result = await bridge.commandsConfig.addCustomCommand(dataDir, command);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      set({ customCommands: result.data });
    },

    updateCustomCommand: async (dataDir: string, name: string, command: CommandConfig) => {
      clearError(get, SCOPE);
      const bridge = window.digitalLife;
      const result = await bridge.commandsConfig.updateCustomCommand(dataDir, name, command);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      set({ customCommands: result.data });
    },

    deleteCustomCommand: async (dataDir: string, name: string) => {
      clearError(get, SCOPE);
      const bridge = window.digitalLife;
      const result = await bridge.commandsConfig.deleteCustomCommand(dataDir, name);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      set({ customCommands: result.data });
    },
  };
}
