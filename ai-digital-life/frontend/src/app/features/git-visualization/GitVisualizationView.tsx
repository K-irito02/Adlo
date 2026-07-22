import React from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { HeatmapCardGroup } from './HeatmapCardGroup';
import { CodeLineEvo } from './charts/CodeLineEvo';
import { CommitTimeline } from './charts/CommitTimeline';
import { FileSunburst } from './charts/FileSunburst';
import { BranchGraph } from './charts/BranchGraph';

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
      <HeatmapCardGroup />
      <ChartCard title={t.gitVisCodeLineEvo} desc={t.gitVisCodeLineEvoDesc}>
        <CodeLineEvo />
      </ChartCard>
      <ChartCard title={t.gitVisCommitTimeline} desc={t.gitVisCommitTimelineDesc}>
        <CommitTimeline />
      </ChartCard>
      <ChartCard title={t.gitVisFileSunburst} desc={t.gitVisFileSunburstDesc}>
        <FileSunburst />
      </ChartCard>
      <ChartCard title={t.gitVisBranchGraph} desc={t.gitVisBranchGraphDesc}>
        <BranchGraph />
      </ChartCard>
      <p className="adl-git-vis__note">{t.gitVisMockDataNote}</p>
    </div>
  );
});
