import { describe, it, expect } from 'vitest';
import {
  resolveGranularity,
  aggregateCodeEvolutionDays,
  aggregateCommitTimeline,
  type Granularity,
} from './chartDataAdapters';

describe('adaptive granularity', () => {
  it('resolves 30/180 day boundaries', () => {
    const d = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000);
    expect(resolveGranularity(d(0), d(30))).toBe('day');
    expect(resolveGranularity(d(0), d(31))).toBe('week');
    expect(resolveGranularity(d(0), d(180))).toBe('week');
    expect(resolveGranularity(d(0), d(181))).toBe('month');
  });

  it('aggregates code evolution to weeks (Monday start) with net & deletedNeg', () => {
    const days = [
      { date: '2024-01-01', additions: 100, deletions: 10 }, // Mon
      { date: '2024-01-02', additions: 50, deletions: 20 },
      { date: '2024-01-08', additions: 30, deletions: 5 }, // next Mon
    ];
    const weeks = aggregateCodeEvolutionDays(days, 'week' as Granularity);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toEqual({ date: '2024-01-01', added: 150, deletedNeg: -30, net: 120 });
    expect(weeks[1]).toEqual({ date: '2024-01-08', added: 30, deletedNeg: -5, net: 25 });
  });

  it('aggregates commit timeline cumulative as bucket-last value', () => {
    const timeline = [
      { date: '2024-01-01', count: 2, cumulative: 2 },
      { date: '2024-01-02', count: 3, cumulative: 5 },
      { date: '2024-01-08', count: 4, cumulative: 9 },
    ];
    const weeks = aggregateCommitTimeline(timeline, 'week' as Granularity);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toEqual({ date: '2024-01-01', count: 5, cumulative: 5 });
    expect(weeks[1]).toEqual({ date: '2024-01-08', count: 4, cumulative: 9 });
  });

  it('keeps day granularity unchanged', () => {
    const days = [{ date: '2024-01-01', additions: 100, deletions: 10 }];
    expect(aggregateCodeEvolutionDays(days, 'day' as Granularity)[0]).toEqual({
      date: '2024-01-01',
      added: 100,
      deletedNeg: -10,
      net: 90,
    });
  });
});
