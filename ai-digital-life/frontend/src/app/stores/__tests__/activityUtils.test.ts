import { describe, it, expect } from 'vitest';
import type { ModelTokenUsage } from '@ai-digital-life/kernel';
import { sumUsageCost } from '../activityUtils';

describe('sumUsageCost', () => {
  it('sums totalCost across usages, ignoring undefined', () => {
    const usages: (ModelTokenUsage | undefined)[] = [
      { totalTokens: 10, cost: { totalCost: 0.0003 } },
      undefined,
      { totalTokens: 5, cost: { totalCost: 0.0001 } },
    ];
    expect(sumUsageCost(usages)).toBeCloseTo(0.0004, 6);
  });
  it('returns 0 for empty input', () => {
    expect(sumUsageCost([])).toBe(0);
  });
  it('ignores usages without cost', () => {
    expect(sumUsageCost([{ totalTokens: 3 }, { cost: { totalCost: 0.5 } }])).toBeCloseTo(0.5, 6);
  });
});
