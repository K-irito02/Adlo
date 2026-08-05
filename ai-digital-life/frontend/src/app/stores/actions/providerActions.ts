import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';
import type { ProviderStatus } from '../../../shared/ipc/provider';
import { clearError, captureError } from '../shared';

function applyProviderStatusPatch(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
  providerId: string,
  fields: Partial<Pick<ProviderStatus, 'enabled' | 'enabledModels'>>,
) {
  set({
    providers: get().providers.map((p) => (p.id === providerId ? { ...p, ...fields } : p)),
  });
}

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

    setAllModelsEnabled: async (providerId: string, enableAll: boolean) => {
      clearError(get);
      const next: string[] | null = enableAll ? null : [];
      applyProviderStatusPatch(set, get, providerId, { enabledModels: next });
      await get().updatePreferences({
        modelPreferences: { [providerId]: { enabledModels: next } },
      });
    },

    toggleModel: async (providerId: string, modelId: string, enabled: boolean) => {
      clearError(get);
      const pref = get().appInfo?.config.modelPreferences.providers[providerId];
      const current: string[] | null = pref?.enabledModels ?? null;
      let next: string[] | null;
      if (enabled) {
        if (current === null) {
          next = [modelId];
        } else if (current.includes(modelId)) {
          return;
        } else {
          next = [...current, modelId];
        }
      } else {
        if (current === null) {
          const provider = get().providers.find((p) => p.id === providerId);
          next = (provider?.models ?? []).map((m) => m.id).filter((id) => id !== modelId);
        } else if (current.length === 0) {
          return;
        } else {
          next = current.filter((id) => id !== modelId);
        }
      }
      applyProviderStatusPatch(set, get, providerId, { enabledModels: next });
      await get().updatePreferences({
        modelPreferences: { [providerId]: { enabledModels: next } },
      });
    },

    setProviderEnabled: async (providerId: string, enabled: boolean) => {
      clearError(get);
      applyProviderStatusPatch(set, get, providerId, { enabled });
      await get().updatePreferences({
        modelPreferences: { [providerId]: { enabled } },
      });
    },
  };
}
