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
import type { RawCommitStats } from './adapters/chartDataAdapters';
import { HeatmapInteractionProvider, HeatmapLegend } from '@/components/charts/heatmap';
import { useModuleMapping } from './hooks/useModuleMapping';
import { ModuleMappingEditor } from './ModuleMappingEditor';
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

interface ContributorModulesData {
  matrix: {
    author: string;
    authorEmail: string;
    modules: { module: string; count: number }[];
  }[];
  allDirectories?: { path: string; depth: number; commitCount: number }[];
}

interface HeatmapCardGroupProps {
  onRefresh?: () => Promise<void>;
  commitStats?: RawCommitStats;
  contributorModules?: ContributorModulesData;
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

  const { rules: mappingRules, saveRules: saveMappingRules, resetToDefault: resetMapping } = useModuleMapping(activeWorkspaceTab);
  const [mappingEditorOpen, setMappingEditorOpen] = useState(false);

  const allDirectories = contributorModules?.allDirectories ?? [];

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

  const currentRange = tabRangesRef.current[activeHeatmapTab];

  // Sync store with ref on mount so initial data fetch uses saved ranges
  useEffect(() => {
    setGitVisTimeRange(
      activeWorkspaceTab,
      CHART_IDS.HEATMAP,
      tabRangesRef.current[activeHeatmapTab],
    );
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

  const descVars = useMemo(() => {
    if (activeHeatmapTab === 'activity') {
      const rowCount = commitStats?.contributorActivity?.length ?? 0;
      const { since, until } = currentRange;
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
      const matrix = contributorModules?.matrix ?? [];
      const rowCount = matrix.length;
      const allModules = new Set<string>();
      matrix.forEach((m) => m.modules.forEach((mod) => allModules.add(mod.module)));
      return { rowCount: String(rowCount), colCount: String(allModules.size) };
    }
    return undefined;
  }, [activeHeatmapTab, commitStats, contributorModules, currentRange]);

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
        {activeHeatmapTab === 'module' && (
          <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto', padding: '0 8px' }}>
            <button
              onClick={() => setMappingEditorOpen(true)}
              aria-label={t.gitVisModuleMappingManage}
              title={t.gitVisModuleMappingManage}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
              </svg>
            </button>
          </div>
        )}
      </nav>
      <HeatmapInteractionProvider portalTarget={document.body}>
        <div
          className="adl-git-vis__chart"
          role="tabpanel"
          id="heatmap-tabpanel"
          aria-labelledby={`heatmap-tab-${activeHeatmapTab}`}
          style={{ overflowX: 'auto', overflowY: 'auto' }}
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
            <ContributorActivityHeatmap
              data={commitStats?.contributorActivity}
              since={currentRange.since}
              until={currentRange.until}
            />
          )}
          {activeHeatmapTab === 'module' && (
            <ContributorModuleHeatmap
              data={contributorModules?.matrix}
              rules={mappingRules}
            />
          )}
        </div>
        <div className="adl-git-vis__heatmap-legend">
          <HeatmapLegend lessLabel={t.gitVisLess} moreLabel={t.gitVisMore} cellSize={10} gap={2} />
        </div>
      </HeatmapInteractionProvider>
      {activeHeatmapTab === 'module' && (
        <ModuleMappingEditor
          isOpen={mappingEditorOpen}
          onClose={() => setMappingEditorOpen(false)}
          directoryTree={allDirectories}
          rules={mappingRules}
          onSave={saveMappingRules}
          onReset={resetMapping}
        />
      )}
      <p className="adl-git-vis__card-desc">
        {descVars
          ? formatT(t, DESC_KEYS[activeHeatmapTab], descVars)
          : t[DESC_KEYS[activeHeatmapTab]]}
      </p>
    </div>
  );
});
