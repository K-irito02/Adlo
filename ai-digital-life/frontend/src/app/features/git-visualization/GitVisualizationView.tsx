import React from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { CalendarHeatmap } from './charts/CalendarHeatmap';
import { ClockHeatmap } from './charts/ClockHeatmap';
import { CodeLineEvo } from './charts/CodeLineEvo';
import { CommitTimeline } from './charts/CommitTimeline';
import { ContributorActivityHeatmap } from './charts/ContributorActivityHeatmap';
import { ContributorModuleHeatmap } from './charts/ContributorModuleHeatmap';
import { FileSunburst } from './charts/FileSunburst';

interface ChartCardProps {
  title: string;
  desc: string;
}

function ChartCard({ title, desc, children }: React.PropsWithChildren<ChartCardProps>) {
  return (
    <div className="adl-git-vis__card">
      <div className="adl-git-vis__card-header">
        <h3 className="adl-git-vis__card-title">{title}</h3>
      </div>
      {children}
      <p className="adl-git-vis__card-desc">{desc}</p>
    </div>
  );
}

export const GitVisualizationView = React.memo(function GitVisualizationView() {
  const { t } = useTCopy();

  return (
    <div className="adl-git-vis__container">
      <ChartCard title={t.gitVisCalendarHeatmap} desc={t.gitVisCalendarHeatmapDesc}>
        <CalendarHeatmap />
      </ChartCard>
      <ChartCard title={t.gitVisClockHeatmap} desc={t.gitVisClockHeatmapDesc}>
        <ClockHeatmap />
      </ChartCard>
      <ChartCard title={t.gitVisCodeLineEvo} desc={t.gitVisCodeLineEvoDesc}>
        <CodeLineEvo />
      </ChartCard>
      <ChartCard title={t.gitVisContributorActivity} desc={t.gitVisContributorActivityDesc}>
        <ContributorActivityHeatmap />
      </ChartCard>
      <ChartCard title={t.gitVisCommitTimeline} desc={t.gitVisCommitTimelineDesc}>
        <CommitTimeline />
      </ChartCard>
      <ChartCard title={t.gitVisContributorModule} desc={t.gitVisContributorModuleDesc}>
        <ContributorModuleHeatmap />
      </ChartCard>
      <ChartCard title={t.gitVisFileSunburst} desc={t.gitVisFileSunburstDesc}>
        <FileSunburst />
      </ChartCard>
      <p className="adl-git-vis__note">{t.gitVisMockDataNote}</p>
    </div>
  );
});
