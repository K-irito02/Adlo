import { describe, it, expect } from 'vitest';
import { sortProvidersForDisplay } from './providerSort';
import type { ConnectionTestResult, ProviderStatus } from './ipc/provider';

function makeProvider(id: string, overrides: Partial<ProviderStatus> = {}): ProviderStatus {
  return {
    id,
    name: id,
    description: '',
    apiType: 'openai',
    builtIn: true,
    configured: true,
    hasKey: false,
    requiresKey: false,
    baseUrl: null,
    models: [],
    enabled: false,
    enabledModels: null,
    ...overrides,
  };
}

function connected(): ConnectionTestResult {
  return { connected: true, error: null };
}

function failed(): ConnectionTestResult {
  return { connected: false, error: 'boom' };
}

describe('sortProvidersForDisplay', () => {
  it('does not mutate the input array', () => {
    const providers = [makeProvider('a', { enabled: true }), makeProvider('b', { hasKey: true })];
    const input = [...providers];
    sortProvidersForDisplay(providers);
    expect(providers).toEqual(input);
  });

  it('ranks enabled providers before disabled ones regardless of key/test state', () => {
    const disabledWithKeyAndTest = makeProvider('a', { hasKey: true });
    const enabledNoKey = makeProvider('b', { enabled: true });
    const result = sortProvidersForDisplay([disabledWithKeyAndTest, enabledNoKey], {
      a: connected(),
    });
    expect(result.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('ranks providers with a stored key above key-less providers', () => {
    const hasKey = makeProvider('a', { hasKey: true, enabled: true });
    const noKey = makeProvider('b', { enabled: true });
    const result = sortProvidersForDisplay([noKey, hasKey]);
    expect(result.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('ranks successfully-tested providers above untested ones', () => {
    const tested = makeProvider('a', { enabled: true, hasKey: true });
    const untested = makeProvider('b', { enabled: true, hasKey: true });
    const result = sortProvidersForDisplay([untested, tested], { a: connected() });
    expect(result.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('does not promote providers whose test failed', () => {
    const failedTest = makeProvider('a', { enabled: true, hasKey: true });
    const untested = makeProvider('b', { enabled: true, hasKey: true });
    const result = sortProvidersForDisplay([failedTest, untested], { a: failed() });
    expect(result.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('keeps the input order (stable registration order) for equal-rank providers', () => {
    const a = makeProvider('openai', { enabled: true, hasKey: true });
    const b = makeProvider('anthropic', { enabled: true, hasKey: true });
    const c = makeProvider('google', { enabled: true, hasKey: true });
    const result = sortProvidersForDisplay([a, b, c]);
    expect(result.map((p) => p.id)).toEqual(['openai', 'anthropic', 'google']);
  });

  it('handles an empty list', () => {
    expect(sortProvidersForDisplay([])).toEqual([]);
  });
});
