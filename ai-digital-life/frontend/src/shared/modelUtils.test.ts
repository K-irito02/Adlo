import { describe, it, expect } from 'vitest';
import { isModelEnabled } from './modelUtils';
import type { ProviderStatus } from './ipc/provider';

function makeProvider(
  enabled: boolean,
  enabledModels: string[],
): Pick<ProviderStatus, 'enabled' | 'enabledModels'> {
  return { enabled, enabledModels };
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
