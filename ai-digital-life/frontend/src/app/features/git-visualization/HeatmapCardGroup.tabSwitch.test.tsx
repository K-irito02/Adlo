import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react';
import React, { useCallback } from 'react';
import { HeatmapCardGroup } from './HeatmapCardGroup';
import { useAppStore } from '@stores/slicedStore';
import { CHART_IDS } from './chartIds';
import { useChartData } from './hooks/useChartData';
import { useGitVisRefresh } from './hooks/useGitVisRefresh';
import type { RawCommitStats } from './adapters/chartDataAdapters';

function createMotionValue(initial = 0) {
  let value = initial;
  const listeners: Record<string, ((v: unknown) => void)[]> = {};
  return {
    get: () => value,
    set: (v: unknown) => {
      value = v as number;
      listeners.change?.forEach((fn) => fn(v));
    },
    stop: () => {},
    on: (event: string, fn: (v: unknown) => void) => {
      (listeners[event] ??= []).push(fn);
      return () => {
        listeners[event] = listeners[event]?.filter((f) => f !== fn);
      };
    },
  };
}

vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get: () =>
        function MotionTag({ children, ...rest }: Record<string, unknown>) {
          const React = require('react');
          return React.createElement('div', { className: rest.className }, children);
        },
    },
  ),
  animate: () => ({ stop: () => {}, then: () => Promise.resolve(), cancel: () => {} }),
  useMotionValue: <T,>(val: T) => createMotionValue(val as number),
  useTransform: () => createMotionValue(0),
  useSpring: (val: unknown) => createMotionValue(typeof val === 'number' ? val : 0),
  useReducedMotion: () => true,
  useAnimation: () => ({
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(),
    set: vi.fn(),
  }),
}));

vi.mock('@visx/responsive', () => ({
  ParentSize: ({
    children,
  }: {
    children: (args: { width: number; height: number }) => React.ReactNode;
  }) => children({ width: 600, height: 200 }),
}));

vi.mock('@hooks/useResolvedTheme', () => ({ useResolvedTheme: vi.fn(() => 'light') }));

vi.mock('../hooks/useBklitTheme', () => ({
  useBklitTheme: () => ({
    accent: '#3b82f6',
    muted: '#94a3b8',
    background: '#ffffff',
    text: '#1e293b',
    seriesColors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
    heatmapColors: ['#f1f5f9', '#bfdbfe', '#60a5fa', '#3b82f6', '#1d4ed8'],
    grid: '#e2e8f0',
    tooltipBg: '#1e293b',
    tooltipText: '#f8fafc',
  }),
}));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: vi.fn(() => ({
    t: {
      gitVisCalendarHeatmap: 'Commit Calendar',
      gitVisClockHeatmap: 'Commit Hours',
      gitVisContributorActivity: 'Contributor Activity',
      gitVisContributorModule: 'Contributor Module',
      gitVisCalendarHeatmapDesc: 'desc1',
      gitVisClockHeatmapDesc: 'desc2',
      gitVisContributorActivityDesc: 'desc3',
      gitVisContributorModuleDesc: 'Row: {rowCount}, Col: {colCount}',
      gitVisHeatmapTabCalendar: 'Calendar',
      gitVisHeatmapTabClock: 'Clock',
      gitVisHeatmapTabActivity: 'Activity',
      gitVisHeatmapTabModule: 'Module',
      gitVisHeatmapNav: 'Heatmap type',
      gitVisLoadingChart: 'Loading chart...',
      gitVisLess: 'Less',
      gitVisMore: 'More',
    },
    locale: 'en-US',
    formatT: (t: Record<string, string>, key: string, vars?: Record<string, string>) => {
      const template = t[key] ?? '';
      return template.replace(/\{(\w+)\}/g, (_, name: string) =>
        String(vars?.[name] ?? `{${name}}`),
      );
    },
  })),
}));

const WS = 'workspace-1';

interface Deferred {
  promise: Promise<unknown>;
  resolve: (v: unknown) => void;
}

function makeDeferred(): Deferred {
  let resolve!: (v: unknown) => void;
  const promise = new Promise<unknown>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const commitStats: RawCommitStats = {
  dailyCommits: [{ date: '2026-01-01', count: 1 }],
  hourlyDistribution: [],
  contributorActivity: [],
  commitTimeline: [{ date: '2026-01-01', count: 1, cumulative: 1 }],
};

/** Mirrors GitVisualizationView's heatmap-card wiring: statuses are derived
 *  from useChartData, and the refresh buttons call the real useGitVisRefresh. */
function Harness() {
  const heatmapData = useChartData(CHART_IDS.HEATMAP);
  const moduleData = useChartData(CHART_IDS.CONTRIBUTOR_MODULES);
  const { refreshChart } = useGitVisRefresh(WS, '/repo');
  const handleRefreshHeatmap = useCallback(() => refreshChart(CHART_IDS.HEATMAP), [refreshChart]);
  const handleRefreshContributorModules = useCallback(
    () => refreshChart(CHART_IDS.CONTRIBUTOR_MODULES),
    [refreshChart],
  );
  return (
    <HeatmapCardGroup
      onRefresh={handleRefreshHeatmap}
      onRefreshContributorModules={handleRefreshContributorModules}
      commitStats={(heatmapData.data as RawCommitStats) ?? commitStats}
      commitStatsStatus={heatmapData.loading ? 'loading' : 'ready'}
      contributorModules={[
        {
          author: 'Alice',
          authorEmail: 'alice@test.com',
          modules: [
            { module: 'src/components/bar.tsx', count: 3 },
            { module: 'docs/readme.md', count: 4 },
          ],
        },
      ]}
      contributorModuleAllPaths={['src/components/bar.tsx', 'docs/readme.md']}
      contributorModuleStatus={moduleData.loading ? 'loading' : 'ready'}
    />
  );
}

function flush(ms = 20) {
  return act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

let heatmapDeferred: Deferred;
let moduleDeferred: Deferred;

beforeEach(() => {
  heatmapDeferred = makeDeferred();
  moduleDeferred = makeDeferred();
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    workspace: {
      gitVisCommitStats: vi.fn(() => heatmapDeferred.promise),
      gitVisContributorModules: vi.fn(() => moduleDeferred.promise),
      gitVisFirstCommitYear: vi.fn(() => Promise.resolve({ ok: true, data: 2020 })),
    },
  };
  useAppStore.setState((s) => ({
    ...s,
    activeHeatmapTab: 'calendar',
    activeWorkspaceTab: WS,
    gitVisData: {},
    gitVisLoading: {},
    gitVisErrors: {},
    gitVisTimeRange: {},
  }));
});

afterEach(() => {
  cleanup();
});

describe('HeatmapCardGroup module → other tab switch (real refresh flow)', () => {
  it(
    'shows the loading label when switching FROM the module tab TO the calendar tab',
    { timeout: 60000 },
    async () => {
      render(<Harness />);

      // Switch to the module tab first: the CONTRIBUTOR_MODULES refresh runs.
      fireEvent.click(screen.getByText('Module'));
      await flush();
      const moduleCall = (
        window as unknown as {
          digitalLife: { workspace: { gitVisContributorModules: ReturnType<typeof vi.fn> } };
        }
      ).digitalLife.workspace.gitVisContributorModules;
      expect(moduleCall).toHaveBeenCalled();
      expect(screen.getAllByText('Loading chart...').length).toBeGreaterThan(0);
      moduleDeferred.resolve({ ok: true, data: { matrix: [], allPaths: [] } });
      await flush();

      // Switch FROM module TO calendar: the HEATMAP refresh must run and
      // surface the loading label even on a fast refresh.
      fireEvent.click(screen.getByText('Calendar'));
      await flush();
      const heatmapCall = (
        window as unknown as {
          digitalLife: { workspace: { gitVisCommitStats: ReturnType<typeof vi.fn> } };
        }
      ).digitalLife.workspace.gitVisCommitStats;
      expect(heatmapCall).toHaveBeenCalled();
      expect(screen.getAllByText('Loading chart...').length).toBeGreaterThan(0);
      heatmapDeferred.resolve({ ok: true, data: commitStats });
      await flush();
    },
  );
});
