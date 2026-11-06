import { describe, expect, it } from 'vitest';
import { buildModuleTree } from '../moduleTreeUtils';
import type { RawCommitStats } from '../adapters/chartDataAdapters';
import { collectHeatmapLevelCounts, resolveHeatmapLevelResolver } from './heatmapLevelScale';

function commitStats(overrides: Partial<RawCommitStats> = {}): RawCommitStats {
  return {
    dailyCommits: [],
    hourlyDistribution: [],
    contributorActivity: [],
    commitTimeline: [],
    ...overrides,
  };
}

describe('collectHeatmapLevelCounts', () => {
  it('clips calendar counts to the displayed year', () => {
    const counts = collectHeatmapLevelCounts({
      tab: 'calendar',
      commitStats: commitStats({
        dailyCommits: [
          { date: '2025-12-31', count: 9 },
          { date: '2026-01-02', count: 4 },
          { date: '2026-02-03', count: 8 },
        ],
      }),
      moduleTree: null,
      moduleDrillPath: [],
      since: '2026-01-01',
      until: '2026-12-31',
    });

    expect(counts).toEqual([4, 8]);
  });

  it('clips activity counts to the selected month range', () => {
    const counts = collectHeatmapLevelCounts({
      tab: 'activity',
      commitStats: commitStats({
        contributorActivity: [
          {
            author: 'Alice',
            authorEmail: 'alice@example.com',
            totalCommits: 9,
            periods: [
              { period: '2025-12', month: 12, count: 9 },
              { period: '2026-01', month: 1, count: 4 },
              { period: '2026-02', month: 2, count: 8 },
            ],
          },
        ],
      }),
      moduleTree: null,
      moduleDrillPath: [],
      since: '2026-01-01',
      until: '2026-12-31',
    });

    expect(counts).toEqual([4, 8]);
  });

  it('parses non-zero-padded custom month bounds numerically', () => {
    const counts = collectHeatmapLevelCounts({
      tab: 'activity',
      commitStats: commitStats({
        contributorActivity: [
          {
            author: 'Alice',
            authorEmail: 'alice@example.com',
            totalCommits: 9,
            periods: [
              { period: '2025-12', month: 12, count: 99 },
              { period: '2026-01', month: 1, count: 4 },
              { period: '2026-02', month: 2, count: 8 },
              { period: '2026-03', month: 3, count: 15 },
              { period: '2026-04', month: 4, count: 99 },
            ],
          },
        ],
      }),
      moduleTree: null,
      moduleDrillPath: [],
      since: '2026-1-1',
      until: '2026-3-1',
    });

    expect(counts).toEqual([4, 8, 15]);
  });

  it('collects clock counts without range filtering', () => {
    const counts = collectHeatmapLevelCounts({
      tab: 'clock',
      commitStats: commitStats({
        hourlyDistribution: [
          { day: 1, hour: 9, count: 4 },
          { day: 2, hour: 10, count: 8 },
        ],
      }),
      moduleTree: null,
      moduleDrillPath: [],
    });

    expect(counts).toEqual([4, 8]);
  });

  it('collects module counts for the current drill level', () => {
    const matrix = [
      {
        author: 'Alice',
        authorEmail: 'alice@example.com',
        modules: [
          { module: 'src/a.ts', count: 4 },
          { module: 'src/b.ts', count: 8 },
          { module: 'docs/c.md', count: 15 },
        ],
      },
    ];

    const rootCounts = collectHeatmapLevelCounts({
      tab: 'module',
      contributorModules: matrix,
      moduleTree: buildModuleTree(['src/a.ts', 'src/b.ts', 'docs/c.md']),
      moduleDrillPath: [],
    });
    expect([...rootCounts].sort((a, b) => a - b)).toEqual([12, 15]);

    const srcCounts = collectHeatmapLevelCounts({
      tab: 'module',
      contributorModules: matrix,
      moduleTree: buildModuleTree(['src/a.ts', 'src/b.ts', 'docs/c.md']),
      moduleDrillPath: ['src'],
    });
    expect(srcCounts).toEqual([4, 8]);
  });

  it('builds a data-driven resolver from the collected counts', () => {
    const resolver = resolveHeatmapLevelResolver({
      tab: 'calendar',
      commitStats: commitStats({
        dailyCommits: [
          { date: '2026-01-01', count: 4 },
          { date: '2026-01-02', count: 8 },
          { date: '2026-01-03', count: 15 },
          { date: '2026-01-04', count: 78 },
        ],
      }),
      moduleTree: null,
      moduleDrillPath: [],
      since: '2026-01-01',
      until: '2026-12-31',
    });

    expect(resolver(4)).toBe(1);
    expect(resolver(8)).toBe(2);
    expect(resolver(15)).toBe(3);
    expect(resolver(78)).toBe(4);
  });
});
