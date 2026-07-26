import React, { useCallback, useMemo } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import {
  HeatmapChart,
  HeatmapCells,
  HeatmapXAxis,
  HeatmapYAxis,
  HeatmapTooltip,
  HeatmapYearHint,
  buildHeatmapFillScale,
  HEATMAP_DEFAULT_LEVEL_STYLES,
} from '@/components/charts/heatmap';
import { contributorActivityToHeatmapColumns } from '../adapters/chartDataAdapters';

interface ContributorActivityHeatmapProps {
  data?: {
    author: string;
    authorEmail: string;
    totalCommits: number;
    periods: { period: string; month: number; count: number }[];
  }[];
  since?: string;
  until?: string;
}

export const ContributorActivityHeatmap = React.memo(function ContributorActivityHeatmap({
  data,
  since,
  until,
}: ContributorActivityHeatmapProps) {
  const { t, locale } = useTCopy();
  const { columns, rowLabels } = useMemo(
    () =>
      data
        ? contributorActivityToHeatmapColumns(data, since, until)
        : { columns: [], rowLabels: [] },
    [data, since, until],
  );

  const customFillScale = useMemo(() => buildHeatmapFillScale(HEATMAP_DEFAULT_LEVEL_STYLES), []);

  const formatLabel = useCallback(
    (count: number) => {
      const word = count === 1 ? t.gitVisContribution : t.gitVisContributions;
      return `${count} ${word}`;
    },
    [t],
  );

  return (
    <HeatmapChart
      data={columns}
      locale={locale}
      rowLabels={rowLabels}
      margin={{ top: 42, right: 16, bottom: 0, left: 80 }}
      gap={2}
      binSize={22}
      animate={true}
      fillScale={customFillScale}
    >
      <HeatmapCells cornerRadius={2} />
      <HeatmapXAxis top={18} tickEvery={2} />
      <HeatmapYearHint />
      <HeatmapYAxis tickFilter="all" />
      <HeatmapTooltip showDelay={150} hideDelay={100} formatLabel={formatLabel} />
    </HeatmapChart>
  );
});
