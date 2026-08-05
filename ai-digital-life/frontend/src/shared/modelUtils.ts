import type { ProviderStatus } from './ipc/provider';

export function isModelEnabled(
  provider: Pick<ProviderStatus, 'enabled' | 'enabledModels'>,
  modelId: string,
): boolean {
  return (
    provider.enabled &&
    (provider.enabledModels.length === 0 || provider.enabledModels.includes(modelId))
  );
}
