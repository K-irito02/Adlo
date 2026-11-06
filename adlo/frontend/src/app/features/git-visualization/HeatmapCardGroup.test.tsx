import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import type * as HeatmapCharts from '@/components/charts/heatmap';
import { HeatmapCardGroup } from './HeatmapCardGroup';

const legendProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
const calendarProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));

vi.mock('./charts/CalendarHeatmap', () => ({
  CalendarHeatmap: (props: Record<string, unknown>) => {
    calendarProps.current = props;
    return props.status === 'loading' ? React.createElement('div', null, 'Loading chart...') : null;
  },
}));

vi.mock('@/components/charts/heatmap', async (importOriginal) => {
  const actual = await importOriginal<typeof HeatmapCharts>();
  return {
    ...actual,
    HeatmapLegend: (props: Record<string, unknown>) => {
      legendProps.current = props;
      return React.createElement('div', { 'data-testid': 'heatmap-legend' });
    },
  };
});

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
          return React.createElement(
            'div',
            { className: rest.className as string },
            children as React.ReactNode,
          );
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

let mockActiveHeatmapTab = 'calendar';

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
      gitVisHeatmapTabClock: 'Hours',
      gitVisHeatmapTabActivity: 'Activity',
      gitVisHeatmapTabModule: 'Module',
      gitVisHeatmapNav: 'Heatmap type',
      gitVisLoadingChart: 'Loading chart...',
      gitVisContribution: 'contribution',
      gitVisContributions: 'contributions',
      gitVisModuleRoot: 'Root',
      gitVisBreadcrumbNav: 'Module breadcrumb',
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

const mockSetActiveHeatmapTab = vi.fn();
const mockRecentWorkspaces = [
  {
    id: 'workspace-1',
    name: 'Workspace 1',
    rootPath: '/test/path',
    path: '/test/path',
    lastOpenedAt: Date.now(),
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true,
  },
];

vi.mock('@stores/slicedStore', () => {
  const buildState = () => ({
    activeHeatmapTab: mockActiveHeatmapTab,
    setActiveHeatmapTab: mockSetActiveHeatmapTab,
    activeWorkspaceTab: 'workspace-1',
    recentWorkspaces: mockRecentWorkspaces,
    showToast: vi.fn(),
    setGitVisTimeRange: vi.fn(),
    gitVisData: {},
  });
  const useAppStore = (selector: (s: Record<string, unknown>) => unknown) => selector(buildState());
  useAppStore.getState = () => buildState();
  return { useAppStore };
});

beforeAll(() => {
  (window as any).digitalLife = {
    workspace: {
      gitVisFirstCommitYear: vi.fn(() => Promise.resolve({ ok: true, data: 2020 })),
    },
  };
});

afterEach(() => {
  cleanup();
  mockSetActiveHeatmapTab.mockClear();
  mockActiveHeatmapTab = 'calendar';
});

describe('HeatmapCardGroup', () => {
  it('renders 4 navigation tabs', { timeout: 30000 }, () => {
    const { container } = render(<HeatmapCardGroup />);
    const tabs = container.querySelectorAll('.adl-git-vis__heatmap-tab');
    expect(tabs.length).toBe(4);
  });

  it('defaults to calendar tab as active', { timeout: 30000 }, () => {
    const { container } = render(<HeatmapCardGroup />);
    const activeTab = container.querySelector('.adl-git-vis__heatmap-tab--active');
    expect(activeTab).toBeTruthy();
    expect(activeTab?.textContent).toBe('Calendar');
  });

  it('calls setActiveHeatmapTab on tab click', { timeout: 30000 }, () => {
    const { container } = render(<HeatmapCardGroup />);
    const tabs = container.querySelectorAll('.adl-git-vis__heatmap-tab');
    fireEvent.click(tabs[1]);
    expect(mockSetActiveHeatmapTab).toHaveBeenCalledWith('clock');
  });

  it('renders description text', { timeout: 30000 }, () => {
    const { container } = render(<HeatmapCardGroup />);
    const desc = container.querySelector('.adl-git-vis__card-desc');
    expect(desc).toBeTruthy();
    expect(desc?.textContent).toBe('desc1');
  });

  it('passes commitStatsStatus loading to heatmap tabs', { timeout: 30000 }, () => {
    render(<HeatmapCardGroup commitStatsStatus="loading" />);
    expect(screen.getAllByText('Loading chart...').length).toBeGreaterThan(0);
  });

  it('passes the same data-driven level resolver to the legend', { timeout: 30000 }, () => {
    const year = new Date().getFullYear();
    const commitStats = {
      dailyCommits: [
        { date: `${year}-01-01`, count: 4 },
        { date: `${year}-01-02`, count: 8 },
        { date: `${year}-01-03`, count: 15 },
        { date: `${year}-01-04`, count: 78 },
      ],
      hourlyDistribution: [],
      contributorActivity: [],
      commitTimeline: [],
    };
    render(<HeatmapCardGroup commitStats={commitStats} commitStatsStatus="ready" />);

    const levelForCount = legendProps.current?.levelForCount as
      | ((count: number) => number)
      | undefined;
    expect(levelForCount).toBeTypeOf('function');
    expect(levelForCount?.(4)).toBe(1);
    expect(levelForCount?.(8)).toBe(2);
    expect(levelForCount?.(15)).toBe(3);
    expect(levelForCount?.(78)).toBe(4);

    const chartLevelForCount = calendarProps.current?.levelForCount as
      | ((count: number) => number)
      | undefined;
    expect(chartLevelForCount).toBeTypeOf('function');
    expect(chartLevelForCount?.(4)).toBe(levelForCount?.(4));
    expect(chartLevelForCount?.(78)).toBe(levelForCount?.(78));
  });

  it(
    'reports the module column count for the current drill level, not the cumulative total',
    { timeout: 30000 },
    () => {
      mockActiveHeatmapTab = 'module';
      const { container } = render(
        <HeatmapCardGroup
          commitStatsStatus="ready"
          contributorModules={[
            {
              author: 'Alice',
              authorEmail: 'alice@test.com',
              modules: [
                { module: 'src/components/bar.tsx', count: 3 },
                { module: 'docs/readme.md', count: 4 },
              ],
            },
            {
              author: 'Bob',
              authorEmail: 'bob@test.com',
              modules: [{ module: 'src/utils/helpers.ts', count: 1 }],
            },
          ]}
          contributorModuleAllPaths={[
            'src/components/bar.tsx',
            'src/components/foo.tsx',
            'src/utils/helpers.ts',
            'docs/readme.md',
          ]}
          contributorModuleStatus="ready"
        />,
      );
      const desc = container.querySelector('.adl-git-vis__card-desc');
      // Root level has 2 children (src, docs) and 2 contributors. The old
      // behavior counted distinct module paths from the matrix (3: bar.tsx,
      // readme.md, helpers.ts) — the fix reports the current level (2).
      expect(desc?.textContent).toBe('Row: 2, Col: 2');
    },
  );

  it('updates the module column count as the user drills into a level', { timeout: 30000 }, () => {
    mockActiveHeatmapTab = 'module';
    const { container } = render(
      <HeatmapCardGroup
        commitStatsStatus="ready"
        contributorModules={[
          {
            author: 'Alice',
            authorEmail: 'alice@test.com',
            modules: [{ module: 'src/components/bar.tsx', count: 3 }],
          },
        ]}
        contributorModuleAllPaths={['src/components/bar.tsx', 'docs/readme.md']}
        contributorModuleStatus="ready"
      />,
    );
    const desc = () => container.querySelector('.adl-git-vis__card-desc');
    // Root level: children are src and docs → 2 columns.
    expect(desc()?.textContent).toBe('Row: 1, Col: 2');
    // Click the 'src' column label in the module heatmap to drill down.
    fireEvent.click(screen.getByText('src'));
    // Drilled to src: its only child is components → 1 column, not the root 2.
    expect(desc()?.textContent).toBe('Row: 1, Col: 1');
  });

  it(
    'resets a stale module drill path when the data no longer contains it',
    { timeout: 30000 },
    () => {
      mockActiveHeatmapTab = 'module';
      const { container, rerender } = render(
        <HeatmapCardGroup
          commitStatsStatus="ready"
          contributorModules={[
            {
              author: 'Alice',
              authorEmail: 'alice@test.com',
              modules: [
                { module: 'src/components/bar.tsx', count: 3 },
                { module: 'docs/readme.md', count: 4 },
                { module: 'tests/foo.test.ts', count: 1 },
              ],
            },
          ]}
          contributorModuleAllPaths={[
            'src/components/bar.tsx',
            'docs/readme.md',
            'tests/foo.test.ts',
          ]}
          contributorModuleStatus="ready"
        />,
      );
      const desc = () => container.querySelector('.adl-git-vis__card-desc');
      // Root level: src, docs, tests → 3 columns.
      expect(desc()?.textContent).toBe('Row: 1, Col: 3');
      fireEvent.click(screen.getByText('src'));
      // Drilled to src: components → 1 column.
      expect(desc()?.textContent).toBe('Row: 1, Col: 1');

      // A data refresh drops the 'src' directory entirely. The stale drill path
      // must fall back to root (docs, tests → 2 columns) instead of showing 0.
      rerender(
        <HeatmapCardGroup
          commitStatsStatus="ready"
          contributorModules={[
            {
              author: 'Alice',
              authorEmail: 'alice@test.com',
              modules: [
                { module: 'docs/readme.md', count: 4 },
                { module: 'tests/foo.test.ts', count: 1 },
              ],
            },
          ]}
          contributorModuleAllPaths={['docs/readme.md', 'tests/foo.test.ts']}
          contributorModuleStatus="ready"
        />,
      );
      expect(desc()?.textContent).toBe('Row: 1, Col: 2');
    },
  );

  it(
    'resets a stale module drill path via the parent even while the module tab is away',
    { timeout: 30000 },
    () => {
      const paths3 = ['src/components/bar.tsx', 'docs/readme.md', 'tests/foo.test.ts'];
      const paths2 = ['docs/readme.md', 'tests/foo.test.ts'];
      const renderBase = (allPaths: string[]) => (
        <HeatmapCardGroup
          commitStatsStatus="ready"
          contributorModules={[
            {
              author: 'Alice',
              authorEmail: 'alice@test.com',
              modules: [
                { module: 'docs/readme.md', count: 4 },
                { module: 'tests/foo.test.ts', count: 1 },
              ],
            },
          ]}
          contributorModuleAllPaths={allPaths}
          contributorModuleStatus="ready"
        />
      );
      mockActiveHeatmapTab = 'module';
      const { container, rerender } = render(renderBase(paths3));
      const desc = () => container.querySelector('.adl-git-vis__card-desc');
      expect(desc()?.textContent).toBe('Row: 1, Col: 3');
      fireEvent.click(screen.getByText('src'));
      expect(desc()?.textContent).toBe('Row: 1, Col: 1');

      // Switch to the calendar tab → the module heatmap (child) unmounts, so only
      // the parent-owned reset effect can clear the stale drill path now.
      mockActiveHeatmapTab = 'calendar';
      rerender(renderBase(paths3));
      // The data refresh drops 'src' while the module tab is away.
      rerender(renderBase(paths2));
      // Switch back to module → the stale path must already be reset to root.
      mockActiveHeatmapTab = 'module';
      rerender(renderBase(paths2));
      expect(desc()?.textContent).toBe('Row: 1, Col: 2');
    },
  );
});
