import { describe, it, expect, afterEach, vi } from 'vitest';
import { defaultTimeRange } from '../gitVisSlice';

afterEach(() => {
  vi.useRealTimers();
});

describe('defaultTimeRange', () => {
  it('defaults to the current calendar year expressed as a custom range', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T10:00:00'));
    expect(defaultTimeRange()).toEqual({
      preset: 'custom',
      since: '2026-01-01',
      until: '2026-12-31',
    });
  });
});
