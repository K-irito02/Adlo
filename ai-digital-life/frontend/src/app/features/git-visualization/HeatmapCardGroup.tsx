import React, { useCallback, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import type { CopyKey } from '@i18n/types';
import type { HeatmapTab } from '@stores/slices/uiSliceTypes';
import type { TimeRangeState } from '@stores/slices/gitVisSlice';
import { defaultTimeRange } from '@stores/slices/gitVisSlice';
import { readJson, writeJson } from '@stores/storageHelpers';
import type { RawCommitStats } from './adapters/chartDataAdapters';
import { HeatmapInteractionProvider, HeatmapLegend } from '@/components/charts/heatmap';
import { CalendarHeatmap } from './charts/CalendarHeatmap';
import { ClockHeatmap } from './charts/ClockHeatmap';
import { ContributorActivityHeatmap } from './charts/ContributorActivityHeatmap';
import { ContributorModuleHeatmap } from './charts/ContributorModuleHeatmap';
import { RefreshButton } from './RefreshButton';
import { TimeRangeSelector } from './TimeRangeSelector';
import { CHART_IDS } from './chartIds';

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
  commitStats?: RawCommitStats;
  contributorModules?: { author: string; authorEmail: string; modules: { module: string; count: number }[] }[];
  yearBounds?: { min: number; max: number } | null;
}

export const HeatmapCardGroup = React.memo(function HeatmapCardGroup({
  onRefresh,
  commitStats,
  contributorModules,
  yearBounds,
}: HeatmapCardGroupProps) {
  const { t } = useTCopy();
  const activeWorkspaceTab = useAppStore((s) => s.activeWorkspaceTab);
  const setGitVisTimeRange = useAppStore((s) => s.setGitVisTimeRange);

  const { activeHeatmapTab, setActiveHeatmapTab } = useAppStore(
    useShallow((s) => ({
      activeHeatmapTab: s.activeHeatmapTab,
      setActiveHeatmapTab: s.setActiveHeatmapTab,
    })),
  );

  function loadTabRanges(): Record<HeatmapTab, TimeRangeState> {
    const saved = readJson<Partial<Record<HeatmapTab, TimeRangeState>> | null>(TAB_TIME_RANGE_KEY, null);
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

  const currentRange = tabRangesRef.current[activeHeatmapTab];

  // Sync store with ref on mount so initial data fetch uses saved ranges
  useEffect(() => {
    setGitVisTimeRange(activeWorkspaceTab, CHART_IDS.HEATMAP, tabRangesRef.current[activeHeatmapTab]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tabChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTabChange = useCallback(
    (tab: HeatmapTab) => {
      if (tabChangeTimerRef.current) {
        clearTimeout(tabChangeTimerRef.current);
      }
      const tabRange = tabRangesRef.current[tab];
      setGitVisTimeRange(activeWorkspaceTab, CHART_IDS.HEATMAP, tabRange);
      setActiveHeatmapTab(tab);
      tabChangeTimerRef.current = setTimeout(() => onRefreshRef.current?.(), 0);
    },
    [activeWorkspaceTab, setGitVisTimeRange, setActiveHeatmapTab],
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
      setGitVisTimeRange(activeWorkspaceTab, CHART_IDS.HEATMAP, range);
      return onRefresh?.();
    },
    [activeHeatmapTab, activeWorkspaceTab, setGitVisTimeRange, onRefresh, persistTabRanges],
  );

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
        {onRefresh && <RefreshButton onRefresh={onRefresh} label={t.gitVisRefreshChart} />}
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
      <HeatmapInteractionProvider>
        <div
          className="adl-git-vis__chart"
          role="tabpanel"
          id="heatmap-tabpanel"
          aria-labelledby={`heatmap-tab-${activeHeatmapTab}`}
        >
          {activeHeatmapTab === 'calendar' && (
            <CalendarHeatmap
              data={commitStats?.dailyCommits}
              year={
                currentRange.since && currentRange.since.length >= 4
                  ? parseInt(currentRange.since.substring(0, 4), 10) || undefined
                  : undefined
              }
            />
          )}
          {activeHeatmapTab === 'clock' && <ClockHeatmap data={commitStats?.hourlyDistribution} />}
          {activeHeatmapTab === 'activity' && (
            <ContributorActivityHeatmap data={commitStats?.contributorActivity} />
          )}
          {activeHeatmapTab === 'module' && (
            <ContributorModuleHeatmap data={contributorModules} />
          )}
        </div>
        <div className="adl-git-vis__heatmap-legend">
          <HeatmapLegend lessLabel={t.gitVisLess} moreLabel={t.gitVisMore} cellSize={10} gap={2} />
        </div>
      </HeatmapInteractionProvider>
      <p className="adl-git-vis__card-desc">{t[DESC_KEYS[activeHeatmapTab]]}</p>
    </div>
  );
});
