import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { GitVisualizationView } from './GitVisualizationView';
import { GIT_VIS_CHART_IDS } from './chartIds';

beforeAll(() => {
  (window as any).digitalLife = {
    workspace: {
      gitVisFirstCommitYear: vi.fn(() => Promise.resolve({ ok: true, data: 2020 })),
    },
  };
});

afterEach(() => {
  cleanup();
  mockActiveWorkspaceTab = 'workspace-1';
  mockRecentWorkspaces = [visibleWorkspace];
  mockGitSnapshots = { 'workspace-1': { isRepo: true, branches: [], conflicts: [] } };
  mockChangesTreeLoading = {};
  mockChangesTreeErrors = {};
  mockGitVisData = {};
  mockGitVisStale = {};
  mockGitVisLoading = {};
  mockGitVisErrors = {};
  mockLoadGitSnapshot.mockClear();
  mockSetActiveWorkspaceTab.mockClear();
  mockRefreshWorkspace.mockClear();
  // The fake-timer guard tests restore real timers inline; this guards against
  // an assertion throwing before they reach that line.
  vi.useRealTimers();
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
          const elProps: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(rest)) {
            if (k !== 'className' && k !== 'children' && k !== 'key') {
              elProps[k] = v;
            }
          }
          return React.createElement(
            tag === 'default' ? 'div' : tag,
            { className: rest.className as string, key: rest.key as string, ...elProps },
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

vi.mock('@hooks/useResolvedTheme', () => ({
  useResolvedTheme: vi.fn(() => 'light'),
}));

const visibleWorkspace = {
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
};
let mockRecentWorkspaces = [visibleWorkspace];

// Mutable store slice backing useAppStore so per-test states (snapshot loaded vs
// missing vs failed) can be asserted without re-registering the whole mock.
let mockActiveWorkspaceTab = 'workspace-1';
let mockGitSnapshots: Record<string, unknown> = {
  'workspace-1': { isRepo: true, branches: [], conflicts: [] },
};
let mockChangesTreeLoading: Record<string, boolean> = {};
let mockChangesTreeErrors: Record<string, string | undefined> = {};
let mockGitVisData: Record<string, Record<string, unknown> | null> = {};
let mockGitVisStale: Record<string, boolean> = {};
let mockGitVisLoading: Record<string, Record<string, boolean>> = {};
let mockGitVisErrors: Record<string, Record<string, string | undefined>> = {};
const mockLoadGitSnapshot = vi.fn(() => Promise.resolve());
const mockSetActiveWorkspaceTab = vi.fn();
const mockRefreshWorkspace = vi.fn(() => Promise.resolve());
const mockRefreshChart = vi.fn(() => Promise.resolve());

vi.mock('./hooks/useYearBounds', () => ({
  useYearBounds: () => ({ yearBounds: { min: 2020, max: 2026 }, loading: false }),
}));

vi.mock('@stores/slicedStore', () => {
  const buildState = () => ({
    activeHeatmapTab: 'calendar',
    setActiveHeatmapTab: vi.fn(),
    activeWorkspaceTab: mockActiveWorkspaceTab,
    setActiveWorkspaceTab: mockSetActiveWorkspaceTab,
    chartColorPreset: 'bklit-default',
    recentWorkspaces: mockRecentWorkspaces,
    gitVisData: mockGitVisData,
    gitVisLoading: mockGitVisLoading,
    gitVisErrors: mockGitVisErrors,
    gitVisStale: mockGitVisStale,
    gitVisTimeRange: {
      'workspace-1': {
        heatmap: { preset: 'year', since: '2026-01-01', until: '2026-12-31' },
        'contributor-modules': { preset: 'year', since: '2026-01-01', until: '2026-12-31' },
        'code-line-evolution': { preset: 'year', since: '2026-01-01', until: '2026-12-31' },
        'commit-timeline': { preset: 'year', since: '2026-01-01', until: '2026-12-31' },
        'file-hotspots': { preset: 'year', since: '2026-01-01', until: '2026-12-31' },
      },
    },
    gitSnapshots: mockGitSnapshots,
    workspaceChangesTreeLoading: mockChangesTreeLoading,
    workspaceChangesTreeErrors: mockChangesTreeErrors,
    loadGitSnapshot: mockLoadGitSnapshot,
    setGitVisData: vi.fn(),
    setGitVisLoading: vi.fn(),
    setGitVisError: vi.fn(),
    setGitVisTimeRange: vi.fn(),
  });
  const useAppStore = (selector: (s: Record<string, unknown>) => unknown) => selector(buildState());
  useAppStore.getState = () => buildState();
  return { useAppStore };
});

vi.mock('./hooks/useBklitTheme', () => ({
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
      gitVisCodeLineEvoAdded: 'Lines added',
      gitVisCodeLineEvoDeleted: 'Lines deleted',
      gitVisCodeLineEvoAddedShort: 'Added',
      gitVisCodeLineEvoDeletedShort: 'Deleted',
      gitVisCodeLineEvoNet: 'Net change',
      gitVisCodeLineEvoToggleLabel: 'Toggle series visibility',
      gitVisContributorActivity: 'Contributor Activity',
      gitVisCommitTimeline: 'Commit Timeline',
      gitVisContributorModule: 'Contributor \u00d7 Module',
      gitVisBranchGraph: 'Branch Graph',
      gitVisBranchGraphDesc: 'desc',
      gitVisBranch: 'Branch',
      gitVisBranchGraphFilterHint: 'Click a branch label to filter',
      gitVisMergedIntoMain: 'merged into main',
      gitVisBranchGraphHelpTitle: 'Branch Graph Guide',
      gitVisBranchGraphHelpAria: 'View branch graph guide',
      gitVisBranchGraphHelpLanesTitle: 'Lanes',
      gitVisBranchGraphHelpLanes: 'Lanes body',
      gitVisBranchGraphHelpNodesTitle: 'Commit nodes',
      gitVisBranchGraphHelpNodes: 'Nodes body',
      gitVisBranchGraphHelpLabelsTitle: 'Branch labels',
      gitVisBranchGraphHelpLabels: 'Labels body',
      gitVisBranchGraphHelpFilterTitle: 'Filter & reorder',
      gitVisBranchGraphHelpFilter: 'Filter body',
      gitVisBranchGraphHelpProgressTitle: 'Progress & merge',
      gitVisBranchGraphHelpProgress: 'Progress body',
      gitVisBranchGraphHelpTableTitle: 'Commit table',
      gitVisBranchGraphHelpTable: 'Table body',
      gitVisCalendarHeatmapDesc: 'desc',
      gitVisClockHeatmapDesc: 'desc',
      gitVisCodeLineEvoDesc: 'desc',
      gitVisContributorActivityDesc: 'desc',
      gitVisCommitTimelineDesc: 'desc',
      gitVisContributorModuleDesc: 'desc',
      gitVisFileHotspotsTitle: 'File Hotspots',
      gitVisHotspotsModeFull: 'Global Ranking',
      gitVisHotspotsModeDrill: 'Level Drill',
      gitVisHotspotsModeLabel: 'Leaderboard mode',
      gitVisHotspotsRankingName: 'Name',
      gitVisHotspotsRankingPath: 'Path',
      gitVisHotspotsRankingChangeCount: 'Changes',
      gitVisHotspotsRankingAdditions: 'Added',
      gitVisHotspotsRankingDeletions: 'Deleted',
      gitVisHotspotsRankingNet: 'Net',
      gitVisHotspotsEmpty: 'No changed files',
      gitVisHotspotsFullHint: 'Full ranking hint',
      gitVisHotspotsDrillHint: 'Drill hint',
      gitVisHotspotsJump: 'Open module tree',
      gitVisHotspotsCopyName: 'Copy name',
      gitVisHotspotsCopyPath: 'Copy full path',
      gitVisHeatmapTabCalendar: 'Calendar',
      gitVisHeatmapTabClock: 'Clock',
      gitVisHeatmapTabActivity: 'Activity',
      gitVisHeatmapTabModule: 'Module',
      gitVisHeatmapNav: 'Heatmap type',
      gitVisRefreshWorkspace: 'Refresh all charts',
      gitVisRefreshChart: 'Refresh this chart',
      gitVisPresetColorTooltip: 'Select chart color theme',
      gitVisTimePrev: 'Earlier Period',
      gitVisTimeNext: 'Later Period',
      gitVisCalendarYearLatest: 'Already the latest year',
      gitVisCalendarYearEarliest: 'Already the earliest year',
      gitVisCalendarSelectYear: 'Select Year',
      gitVisLoadingChart: 'Loading chart...',
      gitVisWorkspaceError: 'Workspace error: {message}',
      gitVisRetry: 'Retry',
      gitVisNoWorkspace: 'NO WORKSPACE SENTINEL',
      gitVisNotGitRepo: 'NOT A GIT REPO SENTINEL',
    },
    formatT: vi.fn(),
  })),
}));

vi.mock('./hooks/useGitVisRefresh', () => ({
  useGitVisRefresh: () => ({
    refreshWorkspace: mockRefreshWorkspace,
    refreshChart: mockRefreshChart,
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

  it('does not call gitVisFirstCommitYear directly (uses useYearBounds hook)', () => {
    render(<GitVisualizationView />);
    expect(window.digitalLife.workspace.gitVisFirstCommitYear).not.toHaveBeenCalled();
  });

  it(
    'renders the code line evolution series toggle inside the card header row',
    { timeout: 30000 },
    () => {
      const { container } = render(<GitVisualizationView />);
      const toggleHeader = Array.from(container.querySelectorAll('.adl-git-vis__card-header')).find(
        (header) => header.querySelector('.adl-git-vis__series-toggle'),
      );
      expect(toggleHeader).toBeTruthy();
      expect(toggleHeader!.querySelectorAll('.adl-git-vis__series-toggle-btn').length).toBe(3);
    },
  );

  it('passes status/loadingLabel to charts instead of rendering null while loading', () => {
    const { container } = render(<GitVisualizationView />);
    // gitVisLoading is {} in the store mock → all charts ready → chart areas render
    expect(container.querySelectorAll('.adl-git-vis__chart').length).toBeGreaterThan(0);
  });

  it('places a help trigger right after the Branch Graph title and shows the guide card on click', async () => {
    const { container } = render(<GitVisualizationView />);
    const cards = [...container.querySelectorAll('.adl-git-vis__card')];
    const branchCard = cards.find(
      (c) => c.querySelector('.adl-git-vis__card-title')?.textContent === 'Branch Graph',
    );
    expect(branchCard).toBeTruthy();

    const title = branchCard!.querySelector('.adl-git-vis__card-title')!;
    // The help trigger is the immediate next sibling of the title.
    const helpTrigger = title.nextElementSibling?.querySelector('button.adl-icon-button--info');
    expect(helpTrigger).toBeTruthy();

    // Click → the guide card appears (rendered in a portal).
    fireEvent.click(helpTrigger!);
    await vi.waitFor(
      () => {
        const card = document.body.querySelector('.hint-card');
        expect(card).toBeTruthy();
        expect(card!.textContent).toContain('Branch Graph Guide');
        expect(card!.textContent).toContain('Lanes body');
      },
      { timeout: 2000 },
    );
  });

  it('renders a neutral loading region instead of the no-workspace hint while the persisted tab is unresolved', () => {
    // Persisted tab id matches no known workspace yet (first-run default).
    mockActiveWorkspaceTab = 'ghost-tab';
    const { container } = render(<GitVisualizationView />);
    // No "请选择一个 Git 工作区" empty-state flash: the charts are replaced by a
    // loading region (unresolved branch) carrying the chart loading label, and the
    // auto-select effect is armed to persist the resolved tab.
    const loadingTexts = Array.from(
      container.querySelectorAll('.adl-git-vis__not-repo-hint-text'),
    ).map((el) => el.textContent);
    expect(loadingTexts).toContain('Loading chart...');
    expect(mockSetActiveWorkspaceTab).toHaveBeenCalled();
  });

  it(
    'does not flash the not-a-git hint while the snapshot is still loading',
    { timeout: 30000 },
    () => {
      // Snapshot slot empty + no loader yet + no error → component triggers the lazy
      // load and keeps charts in a loading state rather than the not-git empty hint.
      mockGitSnapshots = {};
      const { container } = render(<GitVisualizationView />);
      // The snapshot lazy-load effect fires because nothing is cached.
      expect(mockLoadGitSnapshot).toHaveBeenCalled();
      // The mock t provides sentinel values for the empty-state keys, so a
      // wrongly-mounted hint WOULD produce text here. Assert neither the
      // no-workspace nor the not-a-git empty-state text is shown while loading.
      const hintTexts = Array.from(
        container.querySelectorAll('.adl-git-vis__not-repo-hint-text'),
      ).map((el) => el.textContent ?? '');
      expect(hintTexts).not.toContain('NO WORKSPACE SENTINEL');
      expect(hintTexts).not.toContain('NOT A GIT REPO SENTINEL');
      // …and the charts are actually in a loading state (loading label present).
      expect(container.textContent).toContain('Loading chart...');
    },
  );

  it('resolves a persisted hidden workspace tab to a visible workspace', () => {
    // 外部文件的内存隐藏根不应成为 Git 可视化的活动标签。
    mockActiveWorkspaceTab = 'external-hidden';
    mockRecentWorkspaces = [
      visibleWorkspace,
      {
        id: 'external-hidden',
        name: 'Hidden Downloads',
        rootPath: 'E:/Downloads',
        path: 'E:/Downloads',
        lastOpenedAt: Date.now(),
        isPinned: false,
        pinnedOrder: 0,
        unpinnedOrder: 1,
        removedFromSidebar: true,
        available: true,
      },
    ];
    const { container } = render(<GitVisualizationView />);

    // 活动标签回落到可见工作区，隐藏根既不进标签栏也不被当作 Git 工作区。
    expect(mockSetActiveWorkspaceTab).toHaveBeenCalledWith('workspace-1');
    expect(container.textContent).not.toContain('Hidden Downloads');
    // 解析期间显示中性 loading 区域，而不是隐藏根驱动的空态/图表。
    expect(container.textContent).toContain('Loading chart...');
  });

  it('renders a recoverable snapshot-error region instead of a permanent skeleton when the snapshot load failed', () => {
    mockGitSnapshots = {};
    mockChangesTreeErrors = { 'workspace-1': 'git status failed' };
    const { container } = render(<GitVisualizationView />);
    expect(container.querySelector('.adl-git-vis__snapshot-error')).toBeTruthy();
    const retry = container.querySelector('.adl-git-vis__snapshot-error-retry button');
    expect(retry).toBeTruthy();
  });

  // The four guard tests render the full view (5 chart cards); under a fully
  // parallel vitest run that alone can approach the 5s default, so they carry
  // an explicit timeout like the other full-render tests in this file.
  it(
    'skips the automatic workspace refresh when every chart is already cached',
    { timeout: 30000 },
    () => {
      mockGitVisData = {
        'workspace-1': Object.fromEntries(GIT_VIS_CHART_IDS.map((id) => [id, null])),
      };
      mockRefreshWorkspace.mockClear();
      vi.useFakeTimers();
      render(<GitVisualizationView />);
      act(() => {
        vi.advanceTimersByTime(200);
      });
      vi.useRealTimers();
      expect(mockRefreshWorkspace).not.toHaveBeenCalled();
    },
  );

  it(
    'auto-loads the workspace on first visit when no charts are cached',
    { timeout: 30000 },
    () => {
      mockGitVisData = {};
      mockRefreshWorkspace.mockClear();
      vi.useFakeTimers();
      render(<GitVisualizationView />);
      act(() => {
        vi.advanceTimersByTime(200);
      });
      vi.useRealTimers();
      expect(mockRefreshWorkspace).toHaveBeenCalledTimes(1);
    },
  );

  it(
    're-fetches even with a full cache when the workspace is marked stale',
    { timeout: 30000 },
    () => {
      mockGitVisData = {
        'workspace-1': Object.fromEntries(GIT_VIS_CHART_IDS.map((id) => [id, null])),
      };
      mockGitVisStale = { 'workspace-1': true };
      mockRefreshWorkspace.mockClear();
      vi.useFakeTimers();
      render(<GitVisualizationView />);
      act(() => {
        vi.advanceTimersByTime(200);
      });
      vi.useRealTimers();
      expect(mockRefreshWorkspace).toHaveBeenCalledTimes(1);
    },
  );

  it(
    're-fetches a stale workspace even while a per-chart refresh is in flight',
    { timeout: 30000 },
    () => {
      mockGitVisData = {
        'workspace-1': Object.fromEntries(GIT_VIS_CHART_IDS.map((id) => [id, null])),
      };
      mockGitVisStale = { 'workspace-1': true };
      mockGitVisLoading = { 'workspace-1': { heatmap: true } };
      mockRefreshWorkspace.mockClear();
      vi.useFakeTimers();
      render(<GitVisualizationView />);
      act(() => {
        vi.advanceTimersByTime(200);
      });
      vi.useRealTimers();
      expect(mockRefreshWorkspace).toHaveBeenCalledTimes(1);
    },
  );

  it(
    're-arms the auto-refresh when a second commit lands after the view is open',
    { timeout: 30000 },
    () => {
      // A second commit re-marks the workspace stale while the flag is already
      // true (so the boolean subscription alone would not notify); the snapshot
      // head/branch deps must re-arm the effect to retry with the newest head.
      // The store mock has no subscriptions, so a version prop pierces the
      // component's React.memo to force a re-render, re-evaluating the deps
      // exactly like a real zustand notify would.
      const VersionedView = GitVisualizationView as React.ComponentType<{ v?: number }>;
      mockGitVisData = {
        'workspace-1': Object.fromEntries(GIT_VIS_CHART_IDS.map((id) => [id, null])),
      };
      mockGitVisStale = { 'workspace-1': true };
      mockRefreshWorkspace.mockClear();
      vi.useFakeTimers();
      const { rerender } = render(<VersionedView v={1} />);
      act(() => {
        vi.advanceTimersByTime(200);
      });
      mockGitSnapshots = {
        'workspace-1': { isRepo: true, branches: [], conflicts: [], head: 'bbb', branch: 'main' },
      };
      rerender(<VersionedView v={2} />);
      act(() => {
        vi.advanceTimersByTime(200);
      });
      vi.useRealTimers();
      expect(mockRefreshWorkspace).toHaveBeenCalledTimes(2);
    },
  );

  it(
    're-fetches a full cache that has a failing chart instead of reusing it',
    { timeout: 30000 },
    () => {
      // A failed round leaves old data behind an error banner; re-entering the
      // view must retry rather than silently serve the previous round's numbers.
      mockGitVisData = {
        'workspace-1': Object.fromEntries(GIT_VIS_CHART_IDS.map((id) => [id, null])),
      };
      mockGitVisErrors = { 'workspace-1': { heatmap: 'fetch failed' } };
      mockRefreshWorkspace.mockClear();
      vi.useFakeTimers();
      render(<GitVisualizationView />);
      act(() => {
        vi.advanceTimersByTime(200);
      });
      vi.useRealTimers();
      expect(mockRefreshWorkspace).toHaveBeenCalledTimes(1);
    },
  );
});
