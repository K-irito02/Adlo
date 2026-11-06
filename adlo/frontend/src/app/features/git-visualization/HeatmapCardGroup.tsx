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
import { resolveHeatmapLevelResolver } from './utils/heatmapLevelScale';
import { CalendarHeatmap } from './charts/CalendarHeatmap';
import { ClockHeatmap } from './charts/ClockHeatmap';
import { ContributorActivityHeatmap } from './charts/ContributorActivityHeatmap';
import { ContributorModuleHeatmap } from './charts/ContributorModuleHeatmap';
import { RefreshButton } from './RefreshButton';
import { UnderlineTabs } from '../../components/UnderlineTabs';
import { TimeRangeSelector } from './TimeRangeSelector';
import { CHART_IDS } from './chartIds';
import { hasGitVisChart } from './gitVisCache';
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

  // Tab-switch cache guard: skip the re-fetch only when the target tab's chart
  // is already cached FOR THE SAME TIME RANGE. calendar/clock/activity share the
  // HEATMAP chart but keep independent per-tab ranges, so a bare "is the chart
  // cached?" check would reuse data fetched for a different range. Explicit
  // range changes and the card's RefreshButton still force a fetch.
  const isTabRefreshUnnecessary = useCallback(
    (tab: HeatmapTab) => {
      const chartId = tab === 'module' ? CHART_IDS.CONTRIBUTOR_MODULES : CHART_IDS.HEATMAP;
      const state = useAppStore.getState();
      if (!hasGitVisChart(state.gitVisData, activeWorkspaceTab, chartId)) {
        return false;
      }
      // Stale cache (a commit invalidated it) must never be reused: if the
      // workspace-level re-fetch failed, same-range tab switches would otherwise
      // keep serving pre-commit data with no auto-recovery path.
      if (state.gitVisStale?.[activeWorkspaceTab]) {
        return false;
      }
      // A failed fetch for this chart (e.g. a range change whose fetch errored)
      // leaves old data in place with an error shown; reusing it on a tab
      // switch would silently serve the previous range's numbers.
      if (state.gitVisErrors?.[activeWorkspaceTab]?.[chartId]) {
        return false;
      }
      const cachedRange = state.gitVisTimeRange?.[activeWorkspaceTab]?.[chartId];
      if (!cachedRange) {
        return false;
      }
      const targetRange = tabRangesRef.current[tab];
      return (
        JSON.stringify(resolveTimeRangeForFetch(cachedRange)) ===
        JSON.stringify(resolveTimeRangeForFetch(targetRange))
      );
    },
    [activeWorkspaceTab],
  );

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

  // Clear a pending tab-switch refresh timer on unmount so a deferred tab
  // refresh never fires against an unmounted component.
  useEffect(
    () => () => {
      if (tabChangeTimerRef.current) {
        clearTimeout(tabChangeTimerRef.current);
      }
    },
    [],
  );

  const handleTabChange = useCallback(
    (tab: HeatmapTab) => {
      if (tabChangeTimerRef.current) {
        clearTimeout(tabChangeTimerRef.current);
      }
      // Decide before syncing: syncing overwrites the store range, which is the
      // reference the guard compares the cached data against.
      const skip = isTabRefreshUnnecessary(tab);
      if (!skip) {
        syncRangeForTab(tab, tabRangesRef.current[tab]);
      }
      setActiveHeatmapTab(tab);
      if (skip) {
        return;
      }
      tabChangeTimerRef.current = setTimeout(() => {
        // Refresh errors are surfaced through setError in the refresh actions;
        // swallow the rejection here to avoid an unhandled promise rejection.
        void refreshForTab(tab).catch(() => {});
      }, 0);
    },
    [setActiveHeatmapTab, syncRangeForTab, refreshForTab, isTabRefreshUnnecessary],
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

  // Per active tab (module: per drill level). Every visible heatmap cell and
  // the legend tooltip / hover highlight share this resolver so the dynamic
  // boundaries cannot drift between the chart and its legend.
  const levelForCount = useMemo(
    () =>
      resolveHeatmapLevelResolver({
        tab: activeHeatmapTab,
        commitStats,
        contributorModules,
        moduleTree,
        moduleDrillPath,
        since: displayRange.since,
        until: displayRange.until,
      }),
    [
      activeHeatmapTab,
      commitStats,
      contributorModules,
      displayRange.since,
      displayRange.until,
      moduleDrillPath,
      moduleTree,
    ],
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

  const heatmapNavTabs = useMemo(
    () => TABS.map((tab) => ({ id: tab.id, label: t[tab.titleKey] })),
    [t],
  );

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
      {/* tab 导航：与检索设置弹窗共用共享 `UnderlineTabs`
         （下划线动效 + 键盘导航），此处透传原有类名/id，视觉与测试零变化 */}
      <UnderlineTabs
        tabs={heatmapNavTabs}
        activeId={activeHeatmapTab}
        onChange={handleTabChange}
        ariaLabel={t.gitVisHeatmapNav}
        idPrefix="heatmap-tab"
        panelId="heatmap-tabpanel"
        navClassName="adl-git-vis__heatmap-nav"
        tabClassName="adl-git-vis__heatmap-tab"
        activeTabClassName="adl-git-vis__heatmap-tab--active"
      />
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
                  levelForCount={levelForCount}
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
                  levelForCount={levelForCount}
                />
              )}
              {activeHeatmapTab === 'activity' && (
                <ContributorActivityHeatmap
                  data={commitStats?.contributorActivity}
                  since={displayRange.since}
                  until={displayRange.until}
                  status={commitStatsStatus}
                  loadingLabel={loadingLabel}
                  levelForCount={levelForCount}
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
                  levelForCount={levelForCount}
                />
              )}
            </>
          )}
        </div>
        <div className="adl-git-vis__heatmap-legend">
          <HeatmapLegend
            lessLabel={t.gitVisLess}
            moreLabel={t.gitVisMore}
            cellSize={10}
            gap={2}
            levelForCount={levelForCount}
          />
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
