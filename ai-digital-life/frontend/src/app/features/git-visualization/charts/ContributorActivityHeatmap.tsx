import React, { useCallback, useMemo } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import {
  HeatmapChart,
  HeatmapCells,
  HeatmapXAxis,
  HeatmapYAxis,
  HeatmapTooltip,
} from '@/components/charts/heatmap';
import { generateContributorActivityData, contributorNames } from '../data/gitVisMockData';

export const ContributorActivityHeatmap = React.memo(function ContributorActivityHeatmap() {
  const { t } = useTCopy();
  const data = useMemo(() => generateContributorActivityData(), []);

  const formatLabel = useCallback(
    (count: number) => {
      const word = count === 1 ? t.gitVisContribution : t.gitVisContributions;
      return `${count} ${word}`;
    },
    [t]
  );

  return (
    <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
      <HeatmapChart
        data={data}
        rowLabels={contributorNames}
        margin={{ top: 28, right: 16, bottom: 0, left: 80 }}
        gap={2}
        animate={true}
      >
        <HeatmapCells cornerRadius={2} />
        <HeatmapXAxis />
        <HeatmapYAxis />
        <HeatmapTooltip showDelay={150} hideDelay={100} formatLabel={formatLabel} />
      </HeatmapChart>
    </div>
  );
});
