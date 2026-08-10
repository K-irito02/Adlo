import type { ProviderBridge } from '../shared/ipc/provider';
import { invokeIpc } from './tauri-shared';

/**
 * Tauri system-shell provider capabilities (Task 10). The desktop keeps only the
 * credential read-back on Tauri invoke (`get_provider_api_key` /
 * `has_provider_api_key`) so the settings key input can be re-filled after a
 * restart. All other provider operations run over httpBridge to the ad-server.
 */
export function createTauriProviderBridge(): Pick<
  ProviderBridge,
  'getProviderApiKey' | 'hasProviderApiKey'
> {
  return {
    hasProviderApiKey: (provider: string) =>
      invokeIpc<boolean>('has_provider_api_key', { providerId: provider }),
    getProviderApiKey: (provider: string) =>
      invokeIpc<string | null>('get_provider_api_key', { providerId: provider }),
  };
}
