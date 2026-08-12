import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';
import type { AgentConfig } from '@shared/ipc';
import { clearError, captureError } from '../shared';
const SCOPE = 'customAgent';

export function createCustomAgentActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
) {
  return {
    fetchCustomAgents: async (dataDir: string) => {
      set({ isFetchingCustomAgents: true });
      clearError(get, SCOPE);
      const bridge = window.digitalLife;
      const result = await bridge.customAgent.listCustomAgents(dataDir);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        set({ isFetchingCustomAgents: false });
        return;
      }
      set({ customAgents: result.data, isFetchingCustomAgents: false });
    },

    addCustomAgent: async (dataDir: string, agent: AgentConfig) => {
      clearError(get, SCOPE);
      const bridge = window.digitalLife;
      const result = await bridge.customAgent.addCustomAgent(dataDir, agent);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      set({ customAgents: result.data });
    },

    deleteCustomAgent: async (dataDir: string, name: string) => {
      clearError(get, SCOPE);
      const bridge = window.digitalLife;
      const result = await bridge.customAgent.deleteCustomAgent(dataDir, name);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      set({ customAgents: result.data });
    },
  };
}
