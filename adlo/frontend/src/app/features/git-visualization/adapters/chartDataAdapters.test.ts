import { describe, it, expect } from 'vitest';
import {
  resolveGranularity,
  dateLabelFormatterFor,
  aggregateCodeEvolutionDays,
  aggregateCommitTimeline,
  periodEndInclusive,
  type Granularity,
} from './chartDataAdapters';

describe('periodEndInclusive', () => {
  it('returns the same date for day granularity', () => {
    const d = new Date('2026-08-01T00:00:00Z');
    expect(periodEndInclusive(d, 'day').getTime()).toBe(d.getTime());
  });

  it('extends a Monday to the following Sunday for week granularity', () => {
    const monday = new Date('2026-07-27T00:00:00Z');
    expect(periodEndInclusive(monday, 'week').getTime()).toBe(
      new Date('2026-08-02T00:00:00Z').getTime(),
    );
  });

  it("extends a mid-week end to that week's Sunday (not the next week)", () => {
    const thursday = new Date('2026-07-30T00:00:00Z'); // week of Mon 7/27
    expect(periodEndInclusive(thursday, 'week').getTime()).toBe(
      new Date('2026-08-02T00:00:00Z').getTime(),
    );
  });

  it('extends to the last day of the month for month granularity', () => {
    const first = new Date('2026-08-01T00:00:00Z');
    expect(periodEndInclusive(first, 'month').getTime()).toBe(
      new Date('2026-08-31T00:00:00Z').getTime(),
    );
  });
});

describe('dateLabelFormatterFor', () => {
  it('formats day/week as M/D and month as YYYY-MM (padded)', () => {
    const day = new Date(Date.UTC(2026, 0, 5));
    expect(dateLabelFormatterFor('day')(day)).toBe('1/5');
    expect(dateLabelFormatterFor('week')(day)).toBe('1/5');
    const oct = new Date(Date.UTC(2026, 9, 5));
    expect(dateLabelFormatterFor('month')(oct)).toBe('2026-10');
  });

  it('returns a stable formatter reference per granularity', () => {
    expect(dateLabelFormatterFor('day')).toBe(dateLabelFormatterFor('day'));
    expect(dateLabelFormatterFor('week')).toBe(dateLabelFormatterFor('week'));
    expect(dateLabelFormatterFor('month')).toBe(dateLabelFormatterFor('month'));
  });
});

describe('adaptive granularity', () => {
  it('resolves 45/180 day boundaries', () => {
    const d = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000);
    expect(resolveGranularity(d(0), d(30))).toBe('day');
    // Month-long custom ranges (e.g. 7/1–8/1) stay on daily points so the exact
    // latest date is visible instead of being swallowed by a partial last week.
    expect(resolveGranularity(d(0), d(45))).toBe('day');
    expect(resolveGranularity(d(0), d(46))).toBe('week');
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

  it('uses parseable YYYY-MM-DD dates for month buckets', () => {
    const days = [
      { date: '2026-01-05', additions: 10, deletions: 1 },
      { date: '2026-02-10', additions: 20, deletions: 2 },
    ];
    const months = aggregateCodeEvolutionDays(days, 'month' as Granularity);
    expect(months.map((m) => m.date)).toEqual(['2026-01-01', '2026-02-01']);
    // Guard against a regression to bare YYYY-MM keys: the bucket date must
    // parse as a UTC day, not be silently interpreted as a partial timestamp.
    const parsed = new Date(months[1].date + 'T00:00:00Z');
    expect(Number.isNaN(parsed.getTime())).toBe(false);
    expect(parsed.getUTCMonth()).toBe(1); // February
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

  it('zero-fills missing days in code evolution daily aggregation', () => {
    const days = [
      { date: '2024-01-01', additions: 100, deletions: 10 },
      { date: '2024-01-03', additions: 20, deletions: 5 },
    ];
    const result = aggregateCodeEvolutionDays(days, 'day' as Granularity);
    expect(result).toEqual([
      { date: '2024-01-01', added: 100, deletedNeg: -10, net: 90 },
      { date: '2024-01-02', added: 0, deletedNeg: 0, net: 0 },
      { date: '2024-01-03', added: 20, deletedNeg: -5, net: 15 },
    ]);
  });

  it('zero-fills missing weeks in code evolution week aggregation', () => {
    const days = [
      { date: '2024-01-01', additions: 100, deletions: 10 }, // Mon
      { date: '2024-01-15', additions: 30, deletions: 5 }, // Mon (skips 2024-01-08 week)
    ];
    const weeks = aggregateCodeEvolutionDays(days, 'week' as Granularity);
    expect(weeks).toHaveLength(3);
    expect(weeks[0]).toEqual({ date: '2024-01-01', added: 100, deletedNeg: -10, net: 90 });
    expect(weeks[1]).toEqual({ date: '2024-01-08', added: 0, deletedNeg: 0, net: 0 });
    expect(weeks[2]).toEqual({ date: '2024-01-15', added: 30, deletedNeg: -5, net: 25 });
  });

  it('zero-fills missing days in commit timeline with cumulative carry-forward', () => {
    const timeline = [
      { date: '2024-01-01', count: 2, cumulative: 2 },
      { date: '2024-01-03', count: 3, cumulative: 5 },
    ];
    const result = aggregateCommitTimeline(timeline, 'day' as Granularity);
    expect(result).toEqual([
      { date: '2024-01-01', count: 2, cumulative: 2 },
      { date: '2024-01-02', count: 0, cumulative: 2 },
      { date: '2024-01-03', count: 3, cumulative: 5 },
    ]);
  });

  it('zero-fills missing weeks in commit timeline with cumulative carry-forward', () => {
    const timeline = [
      { date: '2024-01-01', count: 2, cumulative: 2 },
      { date: '2024-01-15', count: 1, cumulative: 5 },
    ];
    const weeks = aggregateCommitTimeline(timeline, 'week' as Granularity);
    expect(weeks).toEqual([
      { date: '2024-01-01', count: 2, cumulative: 2 },
      { date: '2024-01-08', count: 0, cumulative: 2 },
      { date: '2024-01-15', count: 1, cumulative: 5 },
    ]);
  });
});
