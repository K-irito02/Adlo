import type { ProviderBridge } from '../shared/ipc/provider';
import { MODEL_CATALOG } from '../shared/modelCatalog';

export const mockProvider: ProviderBridge = {
  setProviderApiKey: async (_provider: string, _apiKey: string) => ({ ok: true, data: true }),
  clearProviderApiKey: async (_provider: string) => ({ ok: true, data: true }),
  hasProviderApiKey: async (_provider: string) => ({ ok: true, data: false }),
  listSupportedProviders: async () => ({
    ok: true,
    data: MODEL_CATALOG.map(({ id, name, requiresKey }) => ({ id, name, requiresKey })),
  }),
  listProviders: async () => ({
    ok: true,
    data: MODEL_CATALOG.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      apiType: p.apiType,
      builtIn: p.builtIn,
      configured: !p.requiresKey,
      hasKey: !p.requiresKey,
      requiresKey: p.requiresKey,
      baseUrl: p.baseUrl,
      models: p.models,
      enabled: true,
      enabledModels: [],
    })),
  }),
  saveProviderConfig: async (_providerId: string, _config: Record<string, unknown>) => ({
    ok: true,
    data: undefined,
  }),
  testProviderConnection: async (_providerId: string) => ({
    ok: true,
    data: { connected: false, error: 'mock: no connection' },
  }),
  fetchProviderModels: async (providerId: string) => ({
    ok: true,
    data: MODEL_CATALOG.find((p) => p.id === providerId)?.models ?? [],
  }),
  addCustomProvider: async (
    _name: string,
    _baseUrl: string,
    _apiKey: string,
    _models: string[],
  ) => ({
    ok: true,
    data: true,
  }),
  removeCustomProvider: async (_providerId: string) => ({ ok: true, data: true }),
};
