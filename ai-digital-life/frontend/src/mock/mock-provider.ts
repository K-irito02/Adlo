import type { ProviderBridge } from "../shared/ipc";

export const mockProvider: ProviderBridge = {
  setProviderApiKey: async (_provider: string, _apiKey: string) => ({ ok: true, data: true }),
  clearProviderApiKey: async (_provider: string) => ({ ok: true, data: true }),
  hasProviderApiKey: async (_provider: string) => ({ ok: true, data: false }),
  listSupportedProviders: async () => ({
    ok: true,
    data: [
      { id: 'deepseek', name: 'DeepSeek', requiresKey: true },
      { id: 'minimax', name: 'MiniMax', requiresKey: true },
      { id: 'openai', name: 'OpenAI', requiresKey: true },
      { id: 'anthropic', name: 'Anthropic', requiresKey: true },
      { id: 'google', name: 'Google Gemini', requiresKey: true },
      { id: 'ollama', name: 'Ollama (Local)', requiresKey: false },
      { id: 'openrouter', name: 'OpenRouter', requiresKey: true },
    ],
  }),
  listProviders: async () => ({ ok: true, data: [] }),
  saveProviderConfig: async (_providerId: string, _config: Record<string, unknown>) => ({
    ok: true,
    data: undefined,
  }),
  testProviderConnection: async (_providerId: string) => ({
    ok: true,
    data: { connected: false, error: 'mock: no connection' },
  }),
  fetchProviderModels: async (_providerId: string) => ({ ok: true, data: [] }),
  addCustomProvider: async (
    _name: string,
    _baseUrl: string,
    _apiKey: string,
    _models: string[]
  ) => ({
    ok: true,
    data: true,
  }),
  removeCustomProvider: async (_providerId: string) => ({ ok: true, data: true }),
};
