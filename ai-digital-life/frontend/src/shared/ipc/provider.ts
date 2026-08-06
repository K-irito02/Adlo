import type { IpcResult, ModelDefinition } from '@ai-digital-life/kernel';

export type { IpcResult, ModelDefinition };

export interface ProviderInfo {
  id: string;
  name: string;
  requiresKey: boolean;
}

export interface ProviderStatus {
  id: string;
  name: string;
  description: string;
  apiType: string;
  builtIn: boolean;
  configured: boolean;
  hasKey: boolean;
  requiresKey: boolean;
  baseUrl: string | null;
  models: ModelDefinition[];
  enabled: boolean;
  enabledModels: string[] | null;
}

export interface ConnectionTestResult {
  connected: boolean;
  error: string | null;
}

export interface ProviderBridge {
  setProviderApiKey(provider: string, apiKey: string): Promise<IpcResult<boolean>>;
  clearProviderApiKey(provider: string): Promise<IpcResult<boolean>>;
  hasProviderApiKey(provider: string): Promise<IpcResult<boolean>>;
  /** Read back the persisted credential so the settings input can be re-filled after a restart. */
  getProviderApiKey(provider: string): Promise<IpcResult<string | null>>;
  listSupportedProviders(): Promise<IpcResult<ProviderInfo[]>>;
  listProviders(): Promise<IpcResult<ProviderStatus[]>>;
  saveProviderConfig(providerId: string, config: Record<string, unknown>): Promise<IpcResult<void>>;
  /** Test connectivity. `apiKey` (if provided) is preferred over the persisted credential. */
  testProviderConnection(
    providerId: string,
    apiKey?: string,
  ): Promise<IpcResult<ConnectionTestResult>>;
  /** Fetch the live model list. `apiKey` (if provided) is preferred over the persisted credential. */
  fetchProviderModels(providerId: string, apiKey?: string): Promise<IpcResult<ModelDefinition[]>>;
  addCustomProvider(
    name: string,
    baseUrl: string,
    apiKey: string,
    models: string[],
  ): Promise<IpcResult<boolean>>;
  removeCustomProvider(providerId: string): Promise<IpcResult<boolean>>;
}
