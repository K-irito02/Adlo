import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { HeatmapCardGroup } from './HeatmapCardGroup';

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
    },
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
    hiddenFromRightPanels: false,
  },
];

vi.mock('@stores/slicedStore', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      activeHeatmapTab: mockActiveHeatmapTab,
      setActiveHeatmapTab: mockSetActiveHeatmapTab,
      activeWorkspaceTab: 'workspace-1',
      recentWorkspaces: mockRecentWorkspaces,
      showToast: vi.fn(),
      setGitVisTimeRange: vi.fn(),
    }),
}));

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
});
