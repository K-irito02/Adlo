import React, { useCallback, useMemo } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import {
  HeatmapChart,
  HeatmapCells,
  HeatmapXAxis,
  HeatmapYAxis,
  HeatmapTooltip,
} from '@/components/charts/heatmap';
import { contributorActivityToHeatmapColumns } from '../adapters/chartDataAdapters';

interface ContributorActivityHeatmapProps {
  data?: {
    author: string;
    authorEmail: string;
    totalCommits: number;
    periods: { period: string; count: number }[];
  }[];
}

export const ContributorActivityHeatmap = React.memo(function ContributorActivityHeatmap({
  data,
}: ContributorActivityHeatmapProps) {
  const { t, locale } = useTCopy();
  const { columns, rowLabels } = useMemo(
    () => (data ? contributorActivityToHeatmapColumns(data) : { columns: [], rowLabels: [] }),
    [data],
  );

  const formatLabel = useCallback(
    (count: number) => {
      const word = count === 1 ? t.gitVisContribution : t.gitVisContributions;
      return `${count} ${word}`;
    },
    [t],
  );

  return (
    <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
      <HeatmapChart
        data={columns}
        locale={locale}
        rowLabels={rowLabels}
        margin={{ top: 28, right: 16, bottom: 0, left: 80 }}
        gap={2}
        binSize={22}
        animate={true}
      >
        <HeatmapCells cornerRadius={2} />
        <HeatmapXAxis tickEvery={4} />
        <HeatmapYAxis />
        <HeatmapTooltip showDelay={150} hideDelay={100} formatLabel={formatLabel} />
      </HeatmapChart>
    </div>
  );
});
