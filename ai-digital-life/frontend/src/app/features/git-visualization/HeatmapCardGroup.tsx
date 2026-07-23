import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import type { CopyKey } from '@i18n/types';
import type { HeatmapTab } from '@stores/slices/uiSliceTypes';
import { HeatmapInteractionProvider, HeatmapLegend } from '@/components/charts/heatmap';
import { CalendarHeatmap } from './charts/CalendarHeatmap';
import { ClockHeatmap } from './charts/ClockHeatmap';
import { ContributorActivityHeatmap } from './charts/ContributorActivityHeatmap';
import { ContributorModuleHeatmap } from './charts/ContributorModuleHeatmap';
import { RefreshButton } from './RefreshButton';

const TABS: { id: HeatmapTab; titleKey: CopyKey }[] = [
  { id: 'calendar', titleKey: 'gitVisHeatmapTabCalendar' },
  { id: 'clock', titleKey: 'gitVisHeatmapTabClock' },
  { id: 'activity', titleKey: 'gitVisHeatmapTabActivity' },
  { id: 'module', titleKey: 'gitVisHeatmapTabModule' },
];

const HEATMAP_COMPONENTS: Record<HeatmapTab, React.ComponentType> = {
  calendar: CalendarHeatmap,
  clock: ClockHeatmap,
  activity: ContributorActivityHeatmap,
  module: ContributorModuleHeatmap,
};

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

export const HeatmapCardGroup = React.memo(function HeatmapCardGroup({
  onRefresh,
}: {
  onRefresh?: () => Promise<void>;
}) {
  const { t } = useTCopy();
  const { activeHeatmapTab, setActiveHeatmapTab } = useAppStore(
    useShallow((s) => ({
      activeHeatmapTab: s.activeHeatmapTab,
      setActiveHeatmapTab: s.setActiveHeatmapTab,
    })),
  );

  const ActiveChart = HEATMAP_COMPONENTS[activeHeatmapTab];

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
    setActiveHeatmapTab(TABS[next].id);
    document.getElementById(`heatmap-tab-${TABS[next].id}`)?.focus();
  };

  return (
    <div className="adl-git-vis__card">
      <div className="adl-git-vis__card-header">
        {onRefresh && <RefreshButton onRefresh={onRefresh} label={t.gitVisRefreshChart} />}
        <h3 className="adl-git-vis__card-title">{t[TITLE_KEYS[activeHeatmapTab]]}</h3>
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
            onClick={() => setActiveHeatmapTab(tab.id)}
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
          <ActiveChart />
        </div>
        <div className="adl-git-vis__heatmap-legend">
          <HeatmapLegend lessLabel={t.gitVisLess} moreLabel={t.gitVisMore} cellSize={10} gap={2} />
        </div>
      </HeatmapInteractionProvider>
      <p className="adl-git-vis__card-desc">{t[DESC_KEYS[activeHeatmapTab]]}</p>
    </div>
  );
});
