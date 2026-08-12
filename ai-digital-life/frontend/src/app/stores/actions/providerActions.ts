import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';
import type { ProviderStatus } from '../../../shared/ipc/provider';
import { clearError, captureError } from '../shared';
const SCOPE = 'provider';

let preferencesQueue: Promise<boolean> = Promise.resolve(true);
function enqueuePreferences(update: () => Promise<boolean>): Promise<boolean> {
  preferencesQueue = preferencesQueue.then(update, update);
  return preferencesQueue;
}

/** `fetchModels` return sentinel: hard failure (IPC-level error). */
export const FETCH_MODELS_FAILED = -1;
/** `fetchModels` return sentinel: the live fetch failed and the returned list is
    the static/cached catalog (the UI shows a non-error notice, never a success). */
export const FETCH_MODELS_FALLBACK = -2;

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
      clearError(get, SCOPE);
      const result = await window.digitalLife.provider.listProviders();
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        set({ isFetchingProviders: false });
        return;
      }
      set({ providers: result.data, isFetchingProviders: false });
      // Re-fill in-memory key inputs from the persisted credential store for
      // providers that have a stored key and an input the user has not edited
      // this session (so keys survive an app restart). Never overwrite a key
      // the user typed, and never re-fill an input the user deliberately
      // cleared — both cases are tracked via keyInputTouched.
      const isPrefillable = (id: string) =>
        !(get().apiKeyInputs[id] ?? '').trim() && !get().keyInputTouched[id];
      const emptyKeyed = result.data.filter((p) => p.hasKey && isPrefillable(p.id));
      await Promise.all(
        emptyKeyed.map(async (p) => {
          const key = await window.digitalLife.provider.getProviderApiKey(p.id);
          // Re-check emptiness AFTER the await: the user may have typed a key
          // (or cleared the input) while the read was in flight — never
          // overwrite their input.
          if (key.ok && key.data && isPrefillable(p.id)) {
            set({ apiKeyInputs: { ...get().apiKeyInputs, [p.id]: key.data } });
          }
        }),
      );
    },

    setApiKey: async (provider: string, apiKey: string): Promise<boolean> => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.provider.setProviderApiKey(provider, apiKey);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return false;
      }
      await get().fetchProviders();
      return true;
    },

    clearApiKey: async (provider: string): Promise<boolean> => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.provider.clearProviderApiKey(provider);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return false;
      }
      // Drop the in-memory input so the cleared state is visible immediately —
      // the input must not keep a stale key after clearing.
      const apiKeyInputs = { ...get().apiKeyInputs };
      delete apiKeyInputs[provider];
      // Also drop the stale connection-test result: without a key the previous
      // "successfully tested" state (chip + sort rank) no longer applies.
      const connectionTestResults = { ...get().connectionTestResults };
      delete connectionTestResults[provider];
      const keyInputTouched = { ...get().keyInputTouched };
      delete keyInputTouched[provider];
      set({ apiKeyInputs, connectionTestResults, keyInputTouched });
      await get().fetchProviders();
      return true;
    },

    testConnection: async (providerId: string, apiKey?: string) => {
      clearError(get, SCOPE);
      set({ testingProviderId: providerId });
      const result = await window.digitalLife.provider.testProviderConnection(providerId, apiKey);
      set({ testingProviderId: null });
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
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
      clearError(get, SCOPE);
      const result = await window.digitalLife.provider.addCustomProvider(
        name,
        baseUrl,
        apiKey,
        models,
      );
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      await get().fetchProviders();
    },

    removeCustomProvider: async (providerId: string) => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.provider.removeCustomProvider(providerId);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      const apiKeyInputs = { ...get().apiKeyInputs };
      delete apiKeyInputs[providerId];
      // Mirror clearApiKey: drop the per-provider touched flag and stale test
      // result too, so a later re-added custom provider with the same id
      // doesn't inherit suppressed prefill / a stale "successfully tested" chip.
      const keyInputTouched = { ...get().keyInputTouched };
      delete keyInputTouched[providerId];
      const connectionTestResults = { ...get().connectionTestResults };
      delete connectionTestResults[providerId];
      set({ apiKeyInputs, keyInputTouched, connectionTestResults });
      await get().fetchProviders();
    },

    selectModel: (providerId: string, modelId: string) => {
      const { recentModelIds } = get();
      const updated = [modelId, ...recentModelIds.filter((id) => id !== modelId)].slice(0, 10);
      set({ selectedProviderId: providerId, selectedModelId: modelId, recentModelIds: updated });
    },

    fetchModels: async (providerId: string, apiKey?: string): Promise<number> => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.provider.fetchProviderModels(providerId, apiKey);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return FETCH_MODELS_FAILED;
      }
      // Any fallback (live fetch failed, or the provider has no dynamic list)
      // must not clobber the last-known-good list — only a genuine live success
      // updates it, so a transient failure never loses the previously fetched
      // models. The initial list already carries the static catalog (seeded by
      // listProviders), so providers with no live data are unaffected.
      if (result.data.fromFallback) {
        return FETCH_MODELS_FALLBACK;
      }
      set({
        providers: get().providers.map((p) =>
          p.id === providerId ? { ...p, models: result.data.models } : p,
        ),
      });
      return result.data.models.length;
    },

    setAllModelsEnabled: async (providerId: string, enableAll: boolean) => {
      clearError(get, SCOPE);
      const next: string[] | null = enableAll ? null : [];
      applyProviderStatusPatch(set, get, providerId, { enabledModels: next });
      const ok = await enqueuePreferences(() =>
        get().updatePreferences({
          modelPreferences: { [providerId]: { enabledModels: next } },
        }),
      );
      if (!ok) {
        await get().fetchProviders();
      }
    },

    toggleModel: async (providerId: string, modelId: string, enabled: boolean) => {
      clearError(get, SCOPE);
      const current: string[] | null =
        get().providers.find((p) => p.id === providerId)?.enabledModels ?? null;
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
          if (!provider || provider.models.length === 0) {
            return;
          }
          next = provider.models.map((m) => m.id).filter((id) => id !== modelId);
        } else if (current.length === 0) {
          return;
        } else {
          next = current.filter((id) => id !== modelId);
        }
      }
      applyProviderStatusPatch(set, get, providerId, { enabledModels: next });
      const ok = await enqueuePreferences(() =>
        get().updatePreferences({
          modelPreferences: { [providerId]: { enabledModels: next } },
        }),
      );
      if (!ok) {
        await get().fetchProviders();
      }
    },

    setProviderEnabled: async (providerId: string, enabled: boolean) => {
      clearError(get, SCOPE);
      applyProviderStatusPatch(set, get, providerId, { enabled });
      const ok = await enqueuePreferences(() =>
        get().updatePreferences({
          modelPreferences: { [providerId]: { enabled } },
        }),
      );
      if (!ok) {
        await get().fetchProviders();
      }
    },
  };
}
