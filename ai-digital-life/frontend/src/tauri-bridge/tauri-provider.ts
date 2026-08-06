import type {
  ProviderBridge,
  ConnectionTestResult,
  ProviderInfo,
  ProviderStatus,
} from '../shared/ipc/provider';
import type { ModelDefinition } from '@ai-digital-life/kernel';
import { invokeIpc } from './tauri-shared';

export function createTauriProviderBridge(): ProviderBridge {
  return {
    setProviderApiKey: (provider: string, apiKey: string) =>
      invokeIpc<boolean>('set_provider_api_key', { providerId: provider, apiKey }),
    clearProviderApiKey: (provider: string) =>
      invokeIpc<boolean>('clear_provider_api_key', { providerId: provider }),
    hasProviderApiKey: (provider: string) =>
      invokeIpc<boolean>('has_provider_api_key', { providerId: provider }),
    getProviderApiKey: (provider: string) =>
      invokeIpc<string | null>('get_provider_api_key', { providerId: provider }),
    listSupportedProviders: () => invokeIpc<ProviderInfo[]>('list_supported_providers'),
    listProviders: () => invokeIpc<ProviderStatus[]>('list_providers'),
    saveProviderConfig: (providerId: string, config: Record<string, unknown>) =>
      invokeIpc<void>('save_provider_config', { providerId, config }),
    testProviderConnection: (providerId: string, apiKey?: string) =>
      invokeIpc<ConnectionTestResult>('test_provider_connection', { providerId, apiKey }),
    fetchProviderModels: (providerId: string, apiKey?: string) =>
      invokeIpc<ModelDefinition[]>('fetch_provider_models', { providerId, apiKey }),
    addCustomProvider: (name: string, baseUrl: string, apiKey: string, models: string[]) =>
      invokeIpc<boolean>('add_custom_provider', { name, baseUrl, apiKey, models }),
    removeCustomProvider: (providerId: string) =>
      invokeIpc<boolean>('remove_custom_provider', { providerId }),
  };
}
