import { describe, it, expect } from 'vitest';
import { isModelEnabled, filterEnabledOptions } from './modelUtils';
import type { ModelDefinition, ProviderStatus } from './ipc/provider';

function makeProvider(
  enabled: boolean,
  enabledModels: string[],
): Pick<ProviderStatus, 'enabled' | 'enabledModels'> {
  return { enabled, enabledModels };
}

function makeFullProvider(
  id: string,
  enabled: boolean,
  enabledModels: string[],
  models: ModelDefinition[],
): ProviderStatus {
  return {
    id,
    name: id,
    description: '',
    apiType: 'openai',
    builtIn: true,
    configured: false,
    hasKey: true,
    requiresKey: true,
    baseUrl: 'https://api.example.com',
    models,
    enabled,
    enabledModels,
  };
}

function makeModel(id: string): ModelDefinition {
  return { id, providerId: '', name: id, description: '', capabilities: [] };
}

describe('isModelEnabled', () => {
  it('returns false when provider is disabled', () => {
    expect(isModelEnabled(makeProvider(false, []), 'deepseek-chat')).toBe(false);
    expect(isModelEnabled(makeProvider(false, ['deepseek-chat']), 'deepseek-chat')).toBe(false);
  });

  it('returns true when enabledModels is empty (all models enabled)', () => {
    expect(isModelEnabled(makeProvider(true, []), 'deepseek-chat')).toBe(true);
    expect(isModelEnabled(makeProvider(true, []), 'deepseek-reasoner')).toBe(true);
  });

  it('returns true when modelId is present in explicit list', () => {
    expect(
      isModelEnabled(makeProvider(true, ['deepseek-chat', 'deepseek-reasoner']), 'deepseek-chat'),
    ).toBe(true);
  });

  it('returns false when modelId is absent from explicit list', () => {
    expect(isModelEnabled(makeProvider(true, ['deepseek-chat']), 'deepseek-reasoner')).toBe(false);
  });
});

describe('filterEnabledOptions', () => {
  it('drops providers whose enabled is false', () => {
    const providers = [
      makeFullProvider('disabled', false, [], [makeModel('m1')]),
      makeFullProvider('enabled', true, [], [makeModel('m2')]),
    ];
    const options = filterEnabledOptions(providers);
    expect(options.map((o) => o.provider.id)).toEqual(['enabled']);
  });

  it('keeps all models when enabledModels is empty (all enabled)', () => {
    const options = filterEnabledOptions([
      makeFullProvider('p', true, [], [makeModel('m1'), makeModel('m2')]),
    ]);
    expect(options[0].models.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('keeps only models present in the explicit enabledModels list', () => {
    const options = filterEnabledOptions([
      makeFullProvider('p', true, ['m1'], [makeModel('m1'), makeModel('m2')]),
    ]);
    expect(options[0].models.map((m) => m.id)).toEqual(['m1']);
  });

  it('drops a group when an enabled provider has zero enabled models', () => {
    const options = filterEnabledOptions([
      makeFullProvider('p', true, ['ghost'], [makeModel('m1')]),
    ]);
    expect(options).toEqual([]);
  });
});
