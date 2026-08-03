import { describe, it, expect } from 'vitest';
import { resolveRollingRange, resolveTimeRangeForFetch } from './timeRangeUtils';

describe('resolveRollingRange', () => {
  it('resolves week preset to trailing 7 days ending today', () => {
    const now = new Date(2026, 7, 3, 10, 0, 0);
    const range = resolveRollingRange('week', now);
    expect(range).toEqual({ since: '2026-07-27', until: '2026-08-03' });
  });

  it('resolves month preset to trailing 1 month ending today', () => {
    const now = new Date(2026, 7, 3, 10, 0, 0);
    const range = resolveRollingRange('month', now);
    expect(range).toEqual({ since: '2026-07-03', until: '2026-08-03' });
  });

  it('resolves year preset to trailing 1 year ending today', () => {
    const now = new Date(2026, 7, 3, 10, 0, 0);
    const range = resolveRollingRange('year', now);
    expect(range).toEqual({ since: '2025-08-03', until: '2026-08-03' });
  });

  it('pads single-digit months and days', () => {
    const now = new Date(2026, 0, 9, 10, 0, 0);
    const range = resolveRollingRange('week', now);
    expect(range).toEqual({ since: '2026-01-02', until: '2026-01-09' });
  });

  it('clamps the month-start to the previous month end instead of overflowing', () => {
    const now = new Date(2026, 2, 31, 10, 0, 0);
    const range = resolveRollingRange('month', now);
    expect(range).toEqual({ since: '2026-02-28', until: '2026-03-31' });
  });

  it('clamps a leap-year February month-start correctly', () => {
    const now = new Date(2024, 2, 31, 10, 0, 0);
    const range = resolveRollingRange('month', now);
    expect(range).toEqual({ since: '2024-02-29', until: '2024-03-31' });
  });
});

describe('resolveTimeRangeForFetch', () => {
  it('keeps the stored range for a custom preset', () => {
    expect(
      resolveTimeRangeForFetch({ preset: 'custom', since: '2026-07-01', until: '2026-07-31' }),
    ).toEqual({ since: '2026-07-01', until: '2026-07-31' });
  });

  it('returns no bounds for the all preset', () => {
    expect(resolveTimeRangeForFetch({ preset: 'all' })).toEqual({
      since: undefined,
      until: undefined,
    });
  });

  it('re-resolves a relative preset against the current date instead of stale stored dates', () => {
    const now = new Date(2026, 7, 3);
    expect(
      resolveTimeRangeForFetch({ preset: 'year', since: '2025-01-01', until: '2025-12-31' }, now),
    ).toEqual({ since: '2025-08-03', until: '2026-08-03' });
  });
});
