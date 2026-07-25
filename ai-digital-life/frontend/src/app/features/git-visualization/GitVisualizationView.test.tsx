import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { GitVisualizationView } from './GitVisualizationView';

beforeAll(() => {
  (window as any).digitalLife = {
    workspace: {
      gitVisFirstCommitYear: vi.fn(() => Promise.resolve({ ok: true, data: 2020 })),
    },
  };
});

afterEach(() => {
  cleanup();
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
      get: (_t: never, tag: string) =>
        function MotionTag({
          children,
          initial: _initial,
          animate: _animate,
          exit: _exit,
          transition: _transition,
          variants: _variants,
          whileHover: _whileHover,
          whileTap: _whileTap,
          style: _style,
          ...rest
        }: Record<string, unknown>) {
          const React = require('react');
          const elProps: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(rest)) {
            if (k !== 'className' && k !== 'children' && k !== 'key') {
              elProps[k] = v;
            }
          }
          return React.createElement(
            tag === 'default' ? 'div' : tag,
            { className: rest.className, key: rest.key, ...elProps },
            children,
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

vi.mock('@hooks/useResolvedTheme', () => ({
  useResolvedTheme: vi.fn(() => 'light'),
}));

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
    hiddenFromRightPanels: false,
  },
];

vi.mock('@stores/slicedStore', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      activeHeatmapTab: 'calendar',
      setActiveHeatmapTab: vi.fn(),
      activeWorkspaceTab: 'workspace-1',
      setActiveWorkspaceTab: vi.fn(),
      chartColorPreset: 'bklit-default',
      recentWorkspaces: mockRecentWorkspaces,
      gitVisData: {},
      gitVisLoading: {},
      gitVisErrors: {},
      gitVisTimeRange: {},
      setGitVisData: vi.fn(),
      setGitVisLoading: vi.fn(),
      setGitVisError: vi.fn(),
      setGitVisTimeRange: vi.fn(),
    }),
}));

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
      gitVisCalendarHeatmap: 'Calendar Heatmap',
      gitVisClockHeatmap: 'Clock Heatmap',
      gitVisCodeLineEvo: 'Code Line Evolution',
      gitVisContributorActivity: 'Contributor Activity',
      gitVisCommitTimeline: 'Commit Timeline',
      gitVisContributorModule: 'Contributor \u00d7 Module',
      gitVisFileSunburst: 'File Sunburst',
      gitVisBranchGraph: 'Branch Graph',
      gitVisBranchGraphDesc: 'desc',
      gitVisBranch: 'Branch',
      gitVisBranchGraphFilterHint: 'Click a branch label to filter',
      gitVisCalendarHeatmapDesc: 'desc',
      gitVisClockHeatmapDesc: 'desc',
      gitVisCodeLineEvoDesc: 'desc',
      gitVisContributorActivityDesc: 'desc',
      gitVisCommitTimelineDesc: 'desc',
      gitVisContributorModuleDesc: 'desc',
      gitVisFileSunburstDesc: 'desc',
      gitVisHeatmapTabCalendar: 'Calendar',
      gitVisHeatmapTabClock: 'Clock',
      gitVisHeatmapTabActivity: 'Activity',
      gitVisHeatmapTabModule: 'Module',
      gitVisHeatmapNav: 'Heatmap type',
      gitVisRefreshWorkspace: 'Refresh all charts',
      gitVisRefreshChart: 'Refresh this chart',
      gitVisPresetColorTooltip: 'Select chart color theme',
    },
    formatT: vi.fn(),
  })),
}));

vi.mock('../hooks/useGitVisRefresh', () => ({
  useGitVisRefresh: () => ({
    refreshWorkspace: vi.fn(() => Promise.resolve()),
    refreshChart: vi.fn(() => Promise.resolve()),
  }),
}));

describe('GitVisualizationView', () => {
  it('renders 5 chart cards', { timeout: 30000 }, () => {
    const { container } = render(<GitVisualizationView />);
    const cards = container.querySelectorAll('.adl-git-vis__card');
    expect(cards.length).toBe(5);
  });

  it('renders scroll container', { timeout: 30000 }, () => {
    const { container } = render(<GitVisualizationView />);
    const scrollContainer = container.querySelector('.adl-git-vis__container');
    expect(scrollContainer).toBeTruthy();
  });

  it('renders WorkspaceTabBar', { timeout: 30000 }, () => {
    const { container } = render(<GitVisualizationView />);
    const tabBar = container.querySelector('.adl-workspace-tab__container');
    expect(tabBar).toBeTruthy();
  });
});
