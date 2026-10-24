import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { HeatmapCardGroup } from './HeatmapCardGroup';
import { defaultTimeRange } from '@stores/slices/gitVisSlice';
import { CHART_IDS } from './chartIds';

const reactRequireCache = vi.hoisted(() => ({ mod: undefined as ReturnType<typeof require> }));
vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get: () =>
        function MotionTag({ children, ...rest }: Record<string, unknown>) {
          const React = (reactRequireCache.mod ??= require('react'));
          return React.createElement('div', { className: rest.className }, children);
        },
    },
  ),
  animate: () => ({ stop: () => {}, then: () => Promise.resolve(), cancel: () => {} }),
  useMotionValue: <T,>(val: T) => ({
    get: () => val,
    set: () => {},
    stop: () => {},
    on: () => () => {},
  }),
  useTransform: () => ({ get: () => 0, set: () => {}, stop: () => {}, on: () => () => {} }),
  useSpring: () => ({ get: () => 0, set: () => {}, stop: () => {}, on: () => () => {} }),
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
      gitVisContributorModuleDesc: 'desc4',
      gitVisHeatmapTabCalendar: 'Calendar',
      gitVisHeatmapTabClock: 'Hours',
      gitVisHeatmapTabActivity: 'Activity',
      gitVisHeatmapTabModule: 'Module',
      gitVisHeatmapNav: 'Heatmap type',
      gitVisRefreshChart: 'Refresh chart',
      gitVisTimeWeek: 'Past Week',
      gitVisTimeMonth: 'Past Month',
      gitVisTimeYear: 'Past Year',
      gitVisTimeAll: 'All Time',
      gitVisTimeCustom: 'Custom',
      gitVisTimePrev: 'Prev',
      gitVisTimeNext: 'Next',
      gitVisModuleExpandAll: 'Expand All',
      gitVisModuleCollapseAll: 'Collapse All',
      gitVisModuleClose: 'Close',
      gitVisModuleConfirm: 'Confirm',
      gitVisModuleCancel: 'Cancel',
      gitVisLoadingChart: 'Loading chart...',
    },
    locale: 'en-US',
    formatT: vi.fn(),
  })),
}));

const mockSetActiveHeatmapTab = vi.fn();
const mockSetGitVisTimeRange = vi.fn();
let mockActiveHeatmapTab = 'module';
let mockGitVisData: Record<string, Record<string, unknown>> = {};
let mockGitVisTimeRange: Record<string, Record<string, unknown>> = {};
let mockGitVisStale: Record<string, boolean> = {};
let mockGitVisErrors: Record<string, Record<string, string | undefined>> = {};

vi.mock('@stores/slicedStore', () => {
  const buildState = () => ({
    activeHeatmapTab: mockActiveHeatmapTab,
    setActiveHeatmapTab: mockSetActiveHeatmapTab,
    activeWorkspaceTab: 'workspace-1',
    recentWorkspaces: [],
    showToast: vi.fn(),
    setGitVisTimeRange: mockSetGitVisTimeRange,
    gitVisData: mockGitVisData,
    gitVisTimeRange: mockGitVisTimeRange,
    gitVisStale: mockGitVisStale,
    gitVisErrors: mockGitVisErrors,
  });
  const useAppStore = (selector: (s: Record<string, unknown>) => unknown) => selector(buildState());
  useAppStore.getState = () => buildState();
  return { useAppStore };
});

afterEach(() => {
  cleanup();
  mockActiveHeatmapTab = 'module';
  mockGitVisData = {};
  mockGitVisTimeRange = {};
  mockGitVisStale = {};
  mockGitVisErrors = {};
  window.localStorage.clear();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('HeatmapCardGroup module tab refresh', () => {
  it('refreshes CONTRIBUTOR_MODULES instead of HEATMAP when the module tab is active', () => {
    const onRefresh = vi.fn();
    const onRefreshContributorModules = vi.fn(() => Promise.resolve());
    const { container } = render(
      <HeatmapCardGroup
        onRefresh={onRefresh}
        onRefreshContributorModules={onRefreshContributorModules}
      />,
    );
    const refreshBtn = container.querySelector('.adl-git-vis__refresh-btn') as HTMLButtonElement;
    fireEvent.click(refreshBtn);
    expect(onRefreshContributorModules).toHaveBeenCalledTimes(1);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('syncs the CONTRIBUTOR_MODULES time range and refreshes it when the range changes on the module tab', () => {
    const onRefresh = vi.fn();
    const onRefreshContributorModules = vi.fn(() => Promise.resolve());
    const { container } = render(
      <HeatmapCardGroup
        onRefresh={onRefresh}
        onRefreshContributorModules={onRefreshContributorModules}
      />,
    );
    const rangeLabel = container.querySelector(
      '.adl-git-vis__timerange-label',
    ) as HTMLButtonElement;
    fireEvent.click(rangeLabel);
    const weekItem = Array.from(
      container.querySelectorAll('.adl-git-vis__timerange-menu-item'),
    ).find((el) => el.textContent === 'Past Week') as HTMLElement;
    fireEvent.click(weekItem);

    const contributorModulesCalls = mockSetGitVisTimeRange.mock.calls.filter(
      (c: unknown[]) => c[1] === 'contributor-modules',
    );
    const weekCall = contributorModulesCalls.find(
      (c: unknown[]) => (c[2] as { preset: string }).preset === 'week',
    );
    expect(weekCall).toBeDefined();
    expect(onRefreshContributorModules).toHaveBeenCalledTimes(1);
  });

  it('syncs the CONTRIBUTOR_MODULES range to the store on mount when the module tab is active', () => {
    const onRefresh = vi.fn();
    const onRefreshContributorModules = vi.fn(() => Promise.resolve());
    render(
      <HeatmapCardGroup
        onRefresh={onRefresh}
        onRefreshContributorModules={onRefreshContributorModules}
      />,
    );

    const contributorModulesCalls = mockSetGitVisTimeRange.mock.calls.filter(
      (c: unknown[]) => c[1] === 'contributor-modules',
    );
    expect(contributorModulesCalls.length).toBeGreaterThan(0);
    expect(contributorModulesCalls[0][2].preset).toBeDefined();
  });

  it('refreshes HEATMAP when the calendar tab is active', () => {
    mockActiveHeatmapTab = 'calendar';
    const onRefresh = vi.fn(() => Promise.resolve());
    const onRefreshContributorModules = vi.fn(() => Promise.resolve());
    const { container } = render(
      <HeatmapCardGroup
        onRefresh={onRefresh}
        onRefreshContributorModules={onRefreshContributorModules}
      />,
    );
    const refreshBtn = container.querySelector('.adl-git-vis__refresh-btn') as HTMLButtonElement;
    fireEvent.click(refreshBtn);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onRefreshContributorModules).not.toHaveBeenCalled();
  });

  it('refreshes CONTRIBUTOR_MODULES when switching to the module tab', () => {
    vi.useFakeTimers();
    mockActiveHeatmapTab = 'calendar';
    const onRefresh = vi.fn(() => Promise.resolve());
    const onRefreshContributorModules = vi.fn(() => Promise.resolve());
    const { container } = render(
      <HeatmapCardGroup
        onRefresh={onRefresh}
        onRefreshContributorModules={onRefreshContributorModules}
      />,
    );
    const moduleTab = Array.from(container.querySelectorAll('.adl-git-vis__heatmap-tab')).find(
      (el) => el.textContent === 'Module',
    ) as HTMLButtonElement;
    fireEvent.click(moduleTab);
    vi.advanceTimersByTime(0);
    vi.useRealTimers();

    const contributorModulesCalls = mockSetGitVisTimeRange.mock.calls.filter(
      (c: unknown[]) => c[1] === 'contributor-modules',
    );
    expect(contributorModulesCalls.length).toBeGreaterThan(0);
    expect(onRefreshContributorModules).toHaveBeenCalledTimes(1);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('skips the refresh when switching to a tab whose chart is already cached for the same range', () => {
    vi.useFakeTimers();
    mockActiveHeatmapTab = 'calendar';
    mockGitVisData = { 'workspace-1': { 'contributor-modules': {} } };
    mockGitVisTimeRange = { 'workspace-1': { 'contributor-modules': defaultTimeRange() } };
    const onRefresh = vi.fn(() => Promise.resolve());
    const onRefreshContributorModules = vi.fn(() => Promise.resolve());
    const { container } = render(
      <HeatmapCardGroup
        onRefresh={onRefresh}
        onRefreshContributorModules={onRefreshContributorModules}
      />,
    );
    const moduleTab = Array.from(container.querySelectorAll('.adl-git-vis__heatmap-tab')).find(
      (el) => el.textContent === 'Module',
    ) as HTMLButtonElement;
    fireEvent.click(moduleTab);
    vi.advanceTimersByTime(0);
    vi.useRealTimers();

    expect(onRefreshContributorModules).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('refreshes when the cached chart was fetched for a different time range', () => {
    vi.useFakeTimers();
    mockActiveHeatmapTab = 'calendar';
    mockGitVisData = { 'workspace-1': { 'contributor-modules': {} } };
    // Cached under a "past week" range while the target tab's range is the
    // default year → must re-fetch instead of showing mismatched-range data.
    mockGitVisTimeRange = {
      'workspace-1': {
        'contributor-modules': { preset: 'week', since: '2026-01-01', until: '2026-01-07' },
      },
    };
    const onRefresh = vi.fn(() => Promise.resolve());
    const onRefreshContributorModules = vi.fn(() => Promise.resolve());
    const { container } = render(
      <HeatmapCardGroup
        onRefresh={onRefresh}
        onRefreshContributorModules={onRefreshContributorModules}
      />,
    );
    const moduleTab = Array.from(container.querySelectorAll('.adl-git-vis__heatmap-tab')).find(
      (el) => el.textContent === 'Module',
    ) as HTMLButtonElement;
    fireEvent.click(moduleTab);
    vi.advanceTimersByTime(0);
    vi.useRealTimers();

    expect(onRefreshContributorModules).toHaveBeenCalledTimes(1);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('re-fetches the shared HEATMAP chart when switching between calendar and clock with different ranges', () => {
    vi.useFakeTimers();
    mockActiveHeatmapTab = 'calendar';
    // Calendar cached the HEATMAP chart under a "past week" range.
    mockGitVisData = { 'workspace-1': { [CHART_IDS.HEATMAP]: {} } };
    mockGitVisTimeRange = {
      'workspace-1': {
        [CHART_IDS.HEATMAP]: { preset: 'week', since: '2026-01-01', until: '2026-01-07' },
      },
    };
    const onRefresh = vi.fn(() => Promise.resolve());
    const onRefreshContributorModules = vi.fn(() => Promise.resolve());
    const { container } = render(
      <HeatmapCardGroup
        onRefresh={onRefresh}
        onRefreshContributorModules={onRefreshContributorModules}
      />,
    );
    const clockTab = Array.from(container.querySelectorAll('.adl-git-vis__heatmap-tab')).find(
      (el) => el.textContent === 'Hours',
    ) as HTMLButtonElement;
    fireEvent.click(clockTab);
    vi.advanceTimersByTime(0);
    vi.useRealTimers();

    // Clock's own range is the default year → must not reuse the week-range data.
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onRefreshContributorModules).not.toHaveBeenCalled();
  });

  it('re-fetches a same-range tab switch when the workspace cache is marked stale', () => {
    // A commit invalidated the cache but the workspace-level re-fetch failed,
    // leaving stale=true. Switching between same-range tabs must not reuse the
    // pre-commit data — there would be no auto-recovery path.
    vi.useFakeTimers();
    mockActiveHeatmapTab = 'calendar';
    mockGitVisData = { 'workspace-1': { [CHART_IDS.CONTRIBUTOR_MODULES]: {} } };
    mockGitVisTimeRange = {
      'workspace-1': { [CHART_IDS.CONTRIBUTOR_MODULES]: defaultTimeRange() },
    };
    mockGitVisStale = { 'workspace-1': true };
    const onRefresh = vi.fn(() => Promise.resolve());
    const onRefreshContributorModules = vi.fn(() => Promise.resolve());
    const { container } = render(
      <HeatmapCardGroup
        onRefresh={onRefresh}
        onRefreshContributorModules={onRefreshContributorModules}
      />,
    );
    const moduleTab = Array.from(container.querySelectorAll('.adl-git-vis__heatmap-tab')).find(
      (el) => el.textContent === 'Module',
    ) as HTMLButtonElement;
    fireEvent.click(moduleTab);
    vi.advanceTimersByTime(0);
    vi.useRealTimers();

    expect(onRefreshContributorModules).toHaveBeenCalledTimes(1);
  });

  it('re-fetches a same-range tab switch when the chart last failed', () => {
    // A range change whose fetch errored left old data behind an error banner;
    // a tab switch must not reuse those stale numbers silently.
    vi.useFakeTimers();
    mockActiveHeatmapTab = 'calendar';
    mockGitVisData = { 'workspace-1': { [CHART_IDS.CONTRIBUTOR_MODULES]: {} } };
    mockGitVisTimeRange = {
      'workspace-1': { [CHART_IDS.CONTRIBUTOR_MODULES]: defaultTimeRange() },
    };
    mockGitVisErrors = { 'workspace-1': { [CHART_IDS.CONTRIBUTOR_MODULES]: 'fetch failed' } };
    const onRefresh = vi.fn(() => Promise.resolve());
    const onRefreshContributorModules = vi.fn(() => Promise.resolve());
    const { container } = render(
      <HeatmapCardGroup
        onRefresh={onRefresh}
        onRefreshContributorModules={onRefreshContributorModules}
      />,
    );
    const moduleTab = Array.from(container.querySelectorAll('.adl-git-vis__heatmap-tab')).find(
      (el) => el.textContent === 'Module',
    ) as HTMLButtonElement;
    fireEvent.click(moduleTab);
    vi.advanceTimersByTime(0);
    vi.useRealTimers();

    expect(onRefreshContributorModules).toHaveBeenCalledTimes(1);
  });
});
