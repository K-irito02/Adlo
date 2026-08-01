import { describe, it, expect } from 'vitest';
import {
  aggregateCodeEvolutionDays,
  buildCommitTimeline,
  parseCommitHeader,
  parseDateParts,
} from './gitVisualization';

describe('parseCommitHeader', () => {
  it('parses a hash|date commit header', () => {
    expect(parseCommitHeader('e1278dba4e87ea8d41da7f9a8d726d54e14c91b4|2026-07-31T15:08:45+08:00')).toBe(
      '2026-07-31',
    );
  });

  it('handles sha256-length hashes', () => {
    const sha256 = 'f'.repeat(64);
    expect(parseCommitHeader(`${sha256}|2025-01-02T03:04:05Z`)).toBe('2025-01-02');
  });

  it('rejects numstat rows, blank lines and malformed input', () => {
    expect(parseCommitHeader('3\t2\tfile.ts')).toBeNull();
    expect(parseCommitHeader('')).toBeNull();
    expect(parseCommitHeader('not a header')).toBeNull();
    expect(parseCommitHeader('hash|2026')).toBeNull();
  });
});

describe('aggregateCodeEvolutionDays', () => {
  it('sums numstat rows by date header and matches the Rust { days } shape', () => {
    const hash40 = 'a'.repeat(40);
    const raw = [
      `${hash40}|2026-07-30T09:00:00+08:00`,
      '3\t1\tfile.rs',
      '5\t2\tfile2.rs',
      `${hash40}|2026-07-31T18:30:00Z`,
      '1\t0\tfile3.rs',
      '-', // blank separator line
      `${hash40}|2026-08-01T10:00:00Z`,
      '-\t-\tbinary.bin', // binary rows count as 0
      '7\t3\ttext.md',
    ].join('\n');

    const days = aggregateCodeEvolutionDays(raw);
    expect(days).toEqual([
      { date: '2026-07-30', additions: 8, deletions: 3 },
      { date: '2026-07-31', additions: 1, deletions: 0 },
      { date: '2026-08-01', additions: 7, deletions: 3 },
    ]);
  });

  it('sorts ascending even when git emits newest-first (descending) input', () => {
    const hash40 = 'a'.repeat(40);
    const raw = [
      `${hash40}|2026-08-01T10:00:00Z`,
      '1\t0\tnew.ts',
      `${hash40}|2026-07-30T09:00:00+08:00`,
      '2\t1\told.ts',
    ].join('\n');

    const days = aggregateCodeEvolutionDays(raw);
    expect(days).toEqual([
      { date: '2026-07-30', additions: 2, deletions: 1 },
      { date: '2026-08-01', additions: 1, deletions: 0 },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(aggregateCodeEvolutionDays('')).toEqual([]);
  });
});

describe('parseDateParts', () => {
  it('reports dayOfWeek with 0 = Sunday .. 6 = Saturday (Rust convention)', () => {
    expect(parseDateParts('2024-01-01T10:00:00+08:00')?.dayOfWeek).toBe(1); // Mon
    expect(parseDateParts('2024-01-07T00:00:00Z')?.dayOfWeek).toBe(0); // Sun
    expect(parseDateParts('2024-12-31T23:00:00Z')?.dayOfWeek).toBe(2); // Tue
    expect(parseDateParts('2024-01-06T00:00:00Z')?.dayOfWeek).toBe(6); // Sat
  });

  it('reports month for contributor period keys (YYYY-MM)', () => {
    expect(parseDateParts('2026-07-31T15:08:45+08:00')?.month).toBe(7);
    expect(parseDateParts('2026-12-01T00:00:00Z')?.month).toBe(12);
  });

  it('returns null for short input', () => {
    expect(parseDateParts('2026')).toBeNull();
  });
});

describe('buildCommitTimeline', () => {
  it('builds an ascending day-by-day timeline with per-day count and running cumulative', () => {
    const daily = new Map<string, number>([
      ['2026-07-29', 3],
      ['2026-07-31', 4],
      ['2026-07-30', 2],
    ]);
    const timeline = buildCommitTimeline(daily);
    expect(timeline).toEqual([
      { date: '2026-07-29', count: 3, cumulative: 3 },
      { date: '2026-07-30', count: 2, cumulative: 5 },
      { date: '2026-07-31', count: 4, cumulative: 9 },
    ]);
  });

  it('returns empty for an empty map', () => {
    expect(buildCommitTimeline(new Map())).toEqual([]);
  });
});
