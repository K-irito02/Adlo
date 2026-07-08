import React from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { CommitGraph } from './charts/CommitGraph';
import { CalendarHeatmap } from './charts/CalendarHeatmap';
import { ClockHeatmap } from './charts/ClockHeatmap';
import { ContributorStats } from './charts/ContributorStats';
import { FileTreemap } from './charts/FileTreemap';
import { CodeLineEvolution } from './charts/CodeLineEvolution';
import { CollabSankey } from './charts/CollabSankey';

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
      <ChartCard title={t.gitVisCommitGraph} desc={t.gitVisCommitGraphDesc}>
        <CommitGraph />
      </ChartCard>
      <ChartCard title={t.gitVisCalendarHeatmap} desc={t.gitVisCalendarHeatmapDesc}>
        <CalendarHeatmap />
      </ChartCard>
      <ChartCard title={t.gitVisClockHeatmap} desc={t.gitVisClockHeatmapDesc}>
        <ClockHeatmap />
      </ChartCard>
      <ChartCard title={t.gitVisContributorStats} desc={t.gitVisContributorStatsDesc}>
        <ContributorStats />
      </ChartCard>
      <ChartCard title={t.gitVisFileTreemap} desc={t.gitVisFileTreemapDesc}>
        <FileTreemap />
      </ChartCard>
      <ChartCard title={t.gitVisCodeLineEvolution} desc={t.gitVisCodeLineEvolutionDesc}>
        <CodeLineEvolution />
      </ChartCard>
      <ChartCard title={t.gitVisCollabSankey} desc={t.gitVisCollabSankeyDesc}>
        <CollabSankey />
      </ChartCard>
      <p className="adl-git-vis__note">{t.gitVisMockDataNote}</p>
    </div>
  );
});
