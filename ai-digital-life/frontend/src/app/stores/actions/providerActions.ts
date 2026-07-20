import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';
import { clearError, captureError } from '../shared';

export function createProviderActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
) {
  return {
    fetchProviders: async () => {
      set({ isFetchingProviders: true });
      clearError(get);
      const result = await window.digitalLife.provider.listProviders();
      if (!result.ok) {
        captureError(get, result.error);
        set({ isFetchingProviders: false });
        return;
      }
      set({ providers: result.data, isFetchingProviders: false });
    },

    setApiKey: async (provider: string, apiKey: string) => {
      clearError(get);
      const result = await window.digitalLife.provider.setProviderApiKey(provider, apiKey);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      await get().fetchProviders();
    },

    clearApiKey: async (provider: string) => {
      clearError(get);
      const result = await window.digitalLife.provider.clearProviderApiKey(provider);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      await get().fetchProviders();
    },

    testConnection: async (providerId: string) => {
      clearError(get);
      set({ testingProviderId: providerId });
      const result = await window.digitalLife.provider.testProviderConnection(providerId);
      set({ testingProviderId: null });
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      set({
        connectionTestResults: {
          ...get().connectionTestResults,
          [providerId]: result.data,
        },
      });
    },

    addCustomProvider: async (name: string, baseUrl: string, apiKey: string, models: string[]) => {
      clearError(get);
      const result = await window.digitalLife.provider.addCustomProvider(
        name,
        baseUrl,
        apiKey,
        models,
      );
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      await get().fetchProviders();
    },

    removeCustomProvider: async (providerId: string) => {
      clearError(get);
      const result = await window.digitalLife.provider.removeCustomProvider(providerId);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      await get().fetchProviders();
    },

    selectModel: (providerId: string, modelId: string) => {
      const { recentModelIds } = get();
      const updated = [modelId, ...recentModelIds.filter((id) => id !== modelId)].slice(0, 10);
      set({ selectedProviderId: providerId, selectedModelId: modelId, recentModelIds: updated });
    },

    fetchModels: async (providerId: string) => {
      clearError(get);
      const result = await window.digitalLife.provider.fetchProviderModels(providerId);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      set({
        providers: get().providers.map((p) =>
          p.id === providerId ? { ...p, models: result.data } : p,
        ),
      });
    },
  };
}
