import { describe, it, expect } from 'vitest';
import type { ModelTokenUsage, ModelUsageCost } from '../types-model';

describe('types-model cost surface', () => {
  it('ModelUsageCost exposes camelCase fields', () => {
    const cost: ModelUsageCost = { inputCost: 0.001, totalCost: 0.0011 };
    expect(cost.inputCost).toBe(0.001);
    expect(cost.totalCost).toBe(0.0011);
  });
  it('ModelTokenUsage accepts cache + cost fields', () => {
    const usage: ModelTokenUsage = {
      promptTokens: 10,
      cacheReadInputTokens: 8,
      cacheCreationInputTokens: 2,
      cost: { totalCost: 0.0003 },
    };
    expect(usage.cacheReadInputTokens).toBe(8);
    expect(usage.cost?.totalCost).toBe(0.0003);
  });
});
