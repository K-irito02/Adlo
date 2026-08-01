import { describe, it, expect } from 'vitest';
import {
  resolveGranularity,
  dateLabelFormatterFor,
  aggregateCodeEvolutionDays,
  aggregateCommitTimeline,
  type Granularity,
} from './chartDataAdapters';

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
