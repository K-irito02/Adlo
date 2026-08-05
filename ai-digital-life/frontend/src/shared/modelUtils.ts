import type { ModelDefinition, ProviderStatus } from './ipc/provider';

export function isModelEnabled(
  provider: Pick<ProviderStatus, 'enabled' | 'enabledModels'>,
  modelId: string,
): boolean {
  return (
    provider.enabled &&
    (provider.enabledModels.length === 0 || provider.enabledModels.includes(modelId))
  );
}

export interface EnabledProviderOption {
  provider: ProviderStatus;
  models: ModelDefinition[];
}

export function filterEnabledOptions(providers: ProviderStatus[]): EnabledProviderOption[] {
  return providers.flatMap((provider) => {
    if (!provider.enabled) {
      return [];
    }
    const models = provider.models.filter((model) => isModelEnabled(provider, model.id));
    return models.length === 0 ? [] : [{ provider, models }];
  });
}
