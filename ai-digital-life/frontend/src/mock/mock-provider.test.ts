import { describe, it, expect } from 'vitest';
import { mockProvider } from './mock-provider';

describe('mockProvider', () => {
  it('listProviders returns 7 providers with real shape', async () => {
    const result = await mockProvider.listProviders();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data).toHaveLength(7);
    for (const provider of result.data) {
      expect(provider.models.length).toBeGreaterThan(0);
      expect(typeof provider.enabled).toBe('boolean');
      expect(provider.enabledModels).toBeNull();
      expect(provider.id).toBeTruthy();
      expect(provider.name).toBeTruthy();
      expect(provider.apiType).toBeTruthy();
      expect(provider.builtIn).toBe(true);
    }
  });

  it('fetchProviderModels returns non-empty models for a known provider', async () => {
    const result = await mockProvider.fetchProviderModels('deepseek');
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.some((m) => m.id === 'deepseek-chat')).toBe(true);
  });

  it('fetchProviderModels returns empty for an unknown provider', async () => {
    const result = await mockProvider.fetchProviderModels('unknown-provider');
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data).toEqual([]);
  });
});
