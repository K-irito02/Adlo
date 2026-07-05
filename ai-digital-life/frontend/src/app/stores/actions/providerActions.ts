import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';
import { clearError, captureError } from '../shared';

export function createProviderActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState
) {
  return {
    fetchProviders: async () => {
      set({ isFetchingProviders: true });
      clearError(get);
      const result = await window.digitalLife.provider.listSupportedProviders();
      if (!result.ok) {
        captureError(get, result.error);
        set({ isFetchingProviders: false });
        return;
      }
      set({ providers: result.data, isFetchingProviders: false });

      const checkResults = await Promise.all(
        result.data.map((p) => window.digitalLife.provider.hasProviderApiKey(p.id))
      );
      const configured = result.data
        .filter((_, i) => {
          const r = checkResults[i];
          return r.ok && r.data;
        })
        .map((p) => p.id);
      set({ configuredProviders: configured });
    },

    setApiKey: async (provider: string, apiKey: string) => {
      clearError(get);
      const result = await window.digitalLife.provider.setProviderApiKey(provider, apiKey);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      await get().checkApiKey(provider);
    },

    clearApiKey: async (provider: string) => {
      clearError(get);
      const result = await window.digitalLife.provider.clearProviderApiKey(provider);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      set({
        configuredProviders: get().configuredProviders.filter((id) => id !== provider),
      });
    },

    checkApiKey: async (provider: string) => {
      clearError(get);
      const result = await window.digitalLife.provider.hasProviderApiKey(provider);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      if (result.data) {
        if (!get().configuredProviders.includes(provider)) {
          set({ configuredProviders: [...get().configuredProviders, provider] });
        }
      } else {
        set({
          configuredProviders: get().configuredProviders.filter((id) => id !== provider),
        });
      }
    },
  };
}
