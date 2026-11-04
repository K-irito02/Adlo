import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearRevealPending,
  isRevealPending,
  markRevealPending,
  resetRevealGateForTest,
} from '../browserRevealGate';

describe('browserRevealGate', () => {
  beforeEach(() => resetRevealGateForTest());

  it('marks a tab pending until explicitly cleared', () => {
    markRevealPending('t1', 10_000);
    expect(isRevealPending('t1')).toBe(true);
    clearRevealPending('t1');
    expect(isRevealPending('t1')).toBe(false);
  });

  it('unknown tab is not pending', () => {
    expect(isRevealPending('nope')).toBe(false);
  });

  it('auto-expires after the deadline (never locks a tab off-screen forever)', () => {
    markRevealPending('t2', -1);
    expect(isRevealPending('t2')).toBe(false);
    // expired entry is dropped
    expect(isRevealPending('t2')).toBe(false);
  });
});
