import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { HeatmapCardGroup } from './HeatmapCardGroup';
import { CodeLineEvo } from './charts/CodeLineEvo';
import { CommitTimeline } from './charts/CommitTimeline';
import { FileSunburst } from './charts/FileSunburst';
import { BranchGraph } from './charts/BranchGraph';
import { ChartColorPresetSelector } from './ChartColorPresetSelector';
import { WorkspaceTabBar } from './WorkspaceTabBar';

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
  const chartColorPreset = useAppStore(useShallow((s) => s.chartColorPreset));

  return (
    <div className="adl-git-vis__container" data-chart-preset={chartColorPreset}>
      <WorkspaceTabBar />
      <div className="adl-git-vis__preset-bar">
        <ChartColorPresetSelector />
      </div>
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
