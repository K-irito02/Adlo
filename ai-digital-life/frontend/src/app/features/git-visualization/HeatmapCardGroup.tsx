import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { formatT } from '@i18n/formatT';
import { useTCopy } from '@i18n/useTCopy';
import type { CopyKey } from '@i18n/types';
import type { HeatmapTab } from '@stores/slices/uiSliceTypes';
import type { TimeRangeState } from '@stores/slices/gitVisSlice';
import { defaultTimeRange } from '@stores/slices/gitVisSlice';
import { readJson, writeJson } from '@stores/storageHelpers';
import type { ChartStatus } from '@/components/charts/chart-phase';
import type { RawCommitStats } from './adapters/chartDataAdapters';
import { buildModuleTree, getChildrenAtPath } from './moduleTreeUtils';
import { HeatmapInteractionProvider, HeatmapLegend } from '@/components/charts/heatmap';
import { CalendarHeatmap } from './charts/CalendarHeatmap';
import { ClockHeatmap } from './charts/ClockHeatmap';
import { ContributorActivityHeatmap } from './charts/ContributorActivityHeatmap';
import { ContributorModuleHeatmap } from './charts/ContributorModuleHeatmap';
import { RefreshButton } from './RefreshButton';
import { TimeRangeSelector } from './TimeRangeSelector';
import { CHART_IDS } from './chartIds';
import { resolveTimeRangeForFetch } from './timeRangeUtils';
import { GitNotRepoHint } from './GitNotRepoHint';

const TAB_TIME_RANGE_KEY = 'adl-git-vis:tab-time-range';

const TABS: { id: HeatmapTab; titleKey: CopyKey }[] = [
  { id: 'calendar', titleKey: 'gitVisHeatmapTabCalendar' },
  { id: 'clock', titleKey: 'gitVisHeatmapTabClock' },
  { id: 'activity', titleKey: 'gitVisHeatmapTabActivity' },
  { id: 'module', titleKey: 'gitVisHeatmapTabModule' },
];

const TITLE_KEYS: Record<HeatmapTab, CopyKey> = {
  calendar: 'gitVisCalendarHeatmap',
  clock: 'gitVisClockHeatmap',
  activity: 'gitVisContributorActivity',
  module: 'gitVisContributorModule',
};

const DESC_KEYS: Record<HeatmapTab, CopyKey> = {
  calendar: 'gitVisCalendarHeatmapDesc',
  clock: 'gitVisClockHeatmapDesc',
  activity: 'gitVisContributorActivityDesc',
  module: 'gitVisContributorModuleDesc',
};

interface HeatmapCardGroupProps {
  onRefresh?: () => Promise<void>;
  /** Refreshes the CONTRIBUTOR_MODULES chart (used while the module tab is active). */
  onRefreshContributorModules?: () => Promise<void>;
  commitStats?: RawCommitStats;
  commitStatsStatus?: ChartStatus;
  contributorModules?: {
    author: string;
    authorEmail: string;
    modules: { module: string; count: number }[];
  }[];
  contributorModuleAllPaths?: string[];
  contributorModuleStatus?: ChartStatus;
  yearBounds?: { min: number; max: number } | null;
  /** Whether the current workspace is a Git repository */
  isGitRepo?: boolean;
  /** Whether a workspace is selected */
  hasWorkspace?: boolean;
  /** Whether the git snapshot has been loaded (false during initial async load) */
  isGitSnapshotLoaded?: boolean;
}

export const HeatmapCardGroup = React.memo(function HeatmapCardGroup({
  onRefresh,
  onRefreshContributorModules,
  commitStats,
  commitStatsStatus = 'ready',
  contributorModules,
  contributorModuleAllPaths,
  contributorModuleStatus,
  yearBounds,
  isGitRepo = true,
  hasWorkspace = true,
  isGitSnapshotLoaded = true,
}: HeatmapCardGroupProps) {
  const { t } = useTCopy();
  const loadingLabel = t.gitVisLoadingChart;
  const activeWorkspaceTab = useAppStore((s) => s.activeWorkspaceTab);
  const setGitVisTimeRange = useAppStore((s) => s.setGitVisTimeRange);

  const { activeHeatmapTab, setActiveHeatmapTab } = useAppStore(
    useShallow((s) => ({
      activeHeatmapTab: s.activeHeatmapTab,
      setActiveHeatmapTab: s.setActiveHeatmapTab,
    })),
  );

  // Drill path for the contributor-module heatmap, lifted here so the card's
  // footer description can report the module count for the CURRENT level
  // instead of the cumulative total across every path.
  const [moduleDrillPath, setModuleDrillPath] = useState<string[]>([]);

  function loadTabRanges(): Record<HeatmapTab, TimeRangeState> {
    const saved = readJson<Partial<Record<HeatmapTab, TimeRangeState>> | null>(
      TAB_TIME_RANGE_KEY,
      null,
    );
    return {
      calendar: saved?.calendar ?? defaultTimeRange(),
      clock: saved?.clock ?? defaultTimeRange(),
      activity: saved?.activity ?? defaultTimeRange(),
      module: saved?.module ?? defaultTimeRange(),
    };
  }
  const tabRangesRef = useRef<Record<HeatmapTab, TimeRangeState>>(loadTabRanges());

  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const onRefreshContributorModulesRef = useRef(onRefreshContributorModules);
  onRefreshContributorModulesRef.current = onRefreshContributorModules;

  const currentRange = tabRangesRef.current[activeHeatmapTab];

  // Re-resolve relative presets (week/month/year) against today on every render
  // rather than memoizing: a refresh fetches with bounds resolved at fetch time,
  // so the display must mirror that same resolved window instead of a frozen
  // snapshot that would drift from the data after a day boundary.
  const displayRange = resolveTimeRangeForFetch(currentRange);

  const refreshForTab = useCallback((tab: HeatmapTab) => {
    if (tab === 'module') {
      return onRefreshContributorModulesRef.current?.() ?? Promise.resolve();
    }
    return onRefreshRef.current?.() ?? Promise.resolve();
  }, []);

  const refreshCurrentTab = useCallback(
    () => refreshForTab(activeHeatmapTab),
    [activeHeatmapTab, refreshForTab],
  );

  const syncRangeForTab = useCallback(
    (tab: HeatmapTab, range: TimeRangeState) => {
      setGitVisTimeRange(activeWorkspaceTab, CHART_IDS.HEATMAP, range);
      if (tab === 'module') {
        setGitVisTimeRange(activeWorkspaceTab, CHART_IDS.CONTRIBUTOR_MODULES, range);
      }
    },
    [activeWorkspaceTab, setGitVisTimeRange],
  );

  // Sync store with ref on mount so initial data fetch uses saved ranges
  useEffect(() => {
    syncRangeForTab(activeHeatmapTab, tabRangesRef.current[activeHeatmapTab]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tabChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTabChange = useCallback(
    (tab: HeatmapTab) => {
      if (tabChangeTimerRef.current) {
        clearTimeout(tabChangeTimerRef.current);
      }
      syncRangeForTab(tab, tabRangesRef.current[tab]);
      setActiveHeatmapTab(tab);
      tabChangeTimerRef.current = setTimeout(() => {
        // Refresh errors are surfaced through setError in the refresh actions;
        // swallow the rejection here to avoid an unhandled promise rejection.
        void refreshForTab(tab).catch(() => {});
      }, 0);
    },
    [setActiveHeatmapTab, syncRangeForTab, refreshForTab],
  );

  const persistTabRanges = useCallback(() => {
    try {
      writeJson(TAB_TIME_RANGE_KEY, tabRangesRef.current);
    } catch {
      // localStorage write failure is non-critical
    }
  }, []);

  const handleTimeRangeChange = useCallback(
    (range: TimeRangeState) => {
      tabRangesRef.current[activeHeatmapTab] = range;
      persistTabRanges();
      syncRangeForTab(activeHeatmapTab, range);
      return refreshCurrentTab();
    },
    [activeHeatmapTab, syncRangeForTab, refreshCurrentTab, persistTabRanges],
  );

  // Module tree used both by the module heatmap's footer column count and kept
  // memoized so drill-path/desc re-renders don't rebuild the tree repeatedly.
  const moduleTree = useMemo(
    () =>
      contributorModuleAllPaths && contributorModuleAllPaths.length > 0
        ? buildModuleTree(contributorModuleAllPaths)
        : null,
    [contributorModuleAllPaths],
  );

  // Reset a stale module drill path here (the state owner) so it is cleared
  // even while the module tab is unmounted and the child heatmap cannot run its
  // own reset — otherwise returning to the tab would briefly show "Col: 0" and
  // a stale breadcrumb after the data dropped the drilled directory. A null
  // tree (no/empty allPaths) means the path is invalid too, so reset as well.
  useEffect(() => {
    if (
      moduleDrillPath.length > 0 &&
      (!moduleTree || getChildrenAtPath(moduleTree, moduleDrillPath).length === 0)
    ) {
      setModuleDrillPath([]);
    }
  }, [moduleTree, moduleDrillPath]);

  const descVars = useMemo(() => {
    if (activeHeatmapTab === 'activity') {
      const rowCount = commitStats?.contributorActivity?.length ?? 0;
      const { since, until } = displayRange;
      let colCount = 0;
      if (since && until) {
        const [y1, m1] = since.substring(0, 7).split('-').map(Number);
        const [y2, m2] = until.substring(0, 7).split('-').map(Number);
        if (!isNaN(y1) && !isNaN(m1) && !isNaN(y2) && !isNaN(m2)) {
          colCount = Math.max(0, (y2 - y1) * 12 + (m2 - m1) + 1);
        }
      }
      return { rowCount: String(rowCount), colCount: String(colCount) };
    }
    if (activeHeatmapTab === 'module') {
      const rowCount = contributorModules?.length ?? 0;
      // Columns correspond to the children of the tree node at the current
      // drill path — i.e. exactly what the heatmap renders at this level, not
      // the cumulative number of distinct module paths across all levels.
      const colCount = moduleTree ? getChildrenAtPath(moduleTree, moduleDrillPath).length : 0;
      return { rowCount: String(rowCount), colCount: String(colCount) };
    }
    return undefined;
  }, [
    activeHeatmapTab,
    commitStats,
    contributorModules,
    moduleTree,
    moduleDrillPath,
    displayRange,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const idx = TABS.findIndex((tab) => tab.id === activeHeatmapTab);
    let next = idx;
    if (e.key === 'ArrowRight') {
      next = (idx + 1) % TABS.length;
    } else if (e.key === 'ArrowLeft') {
      next = (idx - 1 + TABS.length) % TABS.length;
    } else if (e.key === 'Home') {
      next = 0;
    } else if (e.key === 'End') {
      next = TABS.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    handleTabChange(TABS[next].id);
    document.getElementById(`heatmap-tab-${TABS[next].id}`)?.focus();
  };

  return (
    <div className="adl-git-vis__card">
      <div className="adl-git-vis__card-header">
        {(onRefresh || onRefreshContributorModules) && (
          <RefreshButton onRefresh={refreshCurrentTab} label={t.gitVisRefreshChart} />
        )}
        <h3 className="adl-git-vis__card-title">{t[TITLE_KEYS[activeHeatmapTab]]}</h3>
        <TimeRangeSelector
          value={currentRange}
          onChange={handleTimeRangeChange}
          mode={activeHeatmapTab === 'calendar' ? 'year' : 'preset'}
          yearBounds={yearBounds ?? undefined}
        />
      </div>
      <nav
        className="adl-git-vis__heatmap-nav"
        role="tablist"
        aria-label={t.gitVisHeatmapNav}
        onKeyDown={handleKeyDown}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`heatmap-tab-${tab.id}`}
            role="tab"
            className={`adl-git-vis__heatmap-tab${activeHeatmapTab === tab.id ? ' adl-git-vis__heatmap-tab--active' : ''}`}
            aria-selected={activeHeatmapTab === tab.id}
            aria-controls="heatmap-tabpanel"
            onClick={() => handleTabChange(tab.id)}
          >
            {t[tab.titleKey]}
          </button>
        ))}
      </nav>
      <HeatmapInteractionProvider portalTarget={document.body}>
        <div
          className="adl-git-vis__chart"
          role="tabpanel"
          id="heatmap-tabpanel"
          aria-labelledby={`heatmap-tab-${activeHeatmapTab}`}
          style={{ overflowX: 'auto', overflowY: 'auto' }}
        >
          {!hasWorkspace ? (
            <GitNotRepoHint message={t.gitVisNoWorkspace} />
          ) : !isGitRepo && isGitSnapshotLoaded ? (
            <GitNotRepoHint />
          ) : (
            <>
              {activeHeatmapTab === 'calendar' && (
                <CalendarHeatmap
                  data={commitStats?.dailyCommits}
                  status={commitStatsStatus}
                  loadingLabel={loadingLabel}
                  year={
                    displayRange.since && displayRange.since.length >= 4
                      ? parseInt(displayRange.since.substring(0, 4), 10) || undefined
                      : undefined
                  }
                />
              )}
              {activeHeatmapTab === 'clock' && (
                <ClockHeatmap
                  data={commitStats?.hourlyDistribution}
                  status={commitStatsStatus}
                  loadingLabel={loadingLabel}
                />
              )}
              {activeHeatmapTab === 'activity' && (
                <ContributorActivityHeatmap
                  data={commitStats?.contributorActivity}
                  since={displayRange.since}
                  until={displayRange.until}
                  status={commitStatsStatus}
                  loadingLabel={loadingLabel}
                />
              )}
              {activeHeatmapTab === 'module' && (
                <ContributorModuleHeatmap
                  data={contributorModules}
                  allPaths={contributorModuleAllPaths}
                  status={contributorModuleStatus || 'ready'}
                  loadingLabel={loadingLabel}
                  drillPath={moduleDrillPath}
                  onDrillPathChange={setModuleDrillPath}
                />
              )}
            </>
          )}
        </div>
        <div className="adl-git-vis__heatmap-legend">
          <HeatmapLegend lessLabel={t.gitVisLess} moreLabel={t.gitVisMore} cellSize={10} gap={2} />
        </div>
      </HeatmapInteractionProvider>
      <p className="adl-git-vis__card-desc">
        {descVars
          ? formatT(t, DESC_KEYS[activeHeatmapTab], descVars)
          : t[DESC_KEYS[activeHeatmapTab]]}
      </p>
    </div>
  );
});
