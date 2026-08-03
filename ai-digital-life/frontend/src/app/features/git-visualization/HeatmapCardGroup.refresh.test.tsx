import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { HeatmapCardGroup } from './HeatmapCardGroup';

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
    },
    formatT: vi.fn(),
  })),
}));

const mockSetActiveHeatmapTab = vi.fn();
const mockSetGitVisTimeRange = vi.fn();
let mockActiveHeatmapTab = 'module';

vi.mock('@stores/slicedStore', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      activeHeatmapTab: mockActiveHeatmapTab,
      setActiveHeatmapTab: mockSetActiveHeatmapTab,
      activeWorkspaceTab: 'workspace-1',
      recentWorkspaces: [],
      showToast: vi.fn(),
      setGitVisTimeRange: mockSetGitVisTimeRange,
    }),
}));

afterEach(() => {
  cleanup();
  mockActiveHeatmapTab = 'module';
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
});
