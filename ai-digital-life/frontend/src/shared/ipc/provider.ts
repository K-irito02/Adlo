import type { IpcResult, ModelDefinition } from '@ai-digital-life/kernel';

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
  baseUrl: string | null;
  models: ModelDefinition[];
}

export interface ConnectionTestResult {
  connected: boolean;
  error: string | null;
}

export interface ProviderBridge {
  setProviderApiKey(provider: string, apiKey: string): Promise<IpcResult<boolean>>;
  clearProviderApiKey(provider: string): Promise<IpcResult<boolean>>;
  hasProviderApiKey(provider: string): Promise<IpcResult<boolean>>;
  listSupportedProviders(): Promise<IpcResult<ProviderInfo[]>>;
  listProviders(): Promise<IpcResult<ProviderStatus[]>>;
  saveProviderConfig(providerId: string, config: Record<string, unknown>): Promise<IpcResult<void>>;
  testProviderConnection(providerId: string): Promise<IpcResult<ConnectionTestResult>>;
  fetchProviderModels(providerId: string): Promise<IpcResult<ModelDefinition[]>>;
  addCustomProvider(name: string, baseUrl: string, apiKey: string, models: string[]): Promise<IpcResult<boolean>>;
  removeCustomProvider(providerId: string): Promise<IpcResult<boolean>>;
}
