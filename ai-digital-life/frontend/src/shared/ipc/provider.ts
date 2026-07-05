import type { IpcResult } from '@ai-digital-life/kernel';

export interface ProviderInfo {
  id: string;
  name: string;
  requiresKey: boolean;
}

export interface ProviderBridge {
  setProviderApiKey(provider: string, apiKey: string): Promise<IpcResult<boolean>>;
  clearProviderApiKey(provider: string): Promise<IpcResult<boolean>>;
  hasProviderApiKey(provider: string): Promise<IpcResult<boolean>>;
  listSupportedProviders(): Promise<IpcResult<ProviderInfo[]>>;
}
