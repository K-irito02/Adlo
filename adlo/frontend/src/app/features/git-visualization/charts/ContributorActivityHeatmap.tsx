import React, { useCallback, useMemo } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import type { ChartStatus } from '@/components/charts/chart-phase';
import {
  HeatmapChart,
  HeatmapCells,
  HeatmapXAxis,
  HeatmapYAxis,
  HeatmapTooltip,
  HeatmapYearHint,
  generateHeatmapSkeletonFromTarget,
  type HeatmapLevelResolver,
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
  status?: ChartStatus;
  loadingLabel?: string;
  /** Dataset-aware count → level resolver shared with the card legend. */
  levelForCount?: HeatmapLevelResolver;
}

export const ContributorActivityHeatmap = React.memo(function ContributorActivityHeatmap({
  data,
  since,
  until,
  status = 'ready',
  loadingLabel,
  levelForCount,
}: ContributorActivityHeatmapProps) {
  const { t, locale } = useTCopy();
  const { columns, rowLabels } = useMemo(
    () =>
      data
        ? contributorActivityToHeatmapColumns(data, since, until)
        : { columns: [], rowLabels: [] },
    [data, since, until],
  );
  const skeletonTarget = useMemo(() => {
    const months = buildSkeletonActivityPeriods(since, until);
    return contributorActivityToHeatmapColumns(
      [{ author: '', authorEmail: '', totalCommits: 0, periods: months }],
      since,
      until,
    ).columns;
  }, [since, until]);
  const skeletonData = useMemo(
    () => generateHeatmapSkeletonFromTarget(skeletonTarget),
    [skeletonTarget],
  );

  const formatLabel = useCallback(
    (count: number) => {
      const word = count === 1 ? t.gitVisContribution : t.gitVisContributions;
      return `${count} ${word}`;
    },
    [t],
  );

  if (status === 'loading') {
    return (
      <HeatmapChart
        data={skeletonData}
        status="loading"
        loadingLabel={loadingLabel}
        locale={locale}
        rowLabels={rowLabels}
        margin={{ top: 42, right: 16, bottom: 0, left: 80 }}
        gap={2}
        binSize={22}
        animate={true}
      >
        <HeatmapCells cornerRadius={2} />
        <HeatmapXAxis top={18} tickEvery={2} />
        <HeatmapYearHint />
        <HeatmapYAxis tickFilter="all" />
      </HeatmapChart>
    );
  }

  return (
    <HeatmapChart
      data={columns}
      status={status}
      loadingLabel={loadingLabel}
      locale={locale}
      rowLabels={rowLabels}
      margin={{ top: 42, right: 16, bottom: 0, left: 80 }}
      gap={2}
      binSize={22}
      animate={true}
      levelForCount={levelForCount}
    >
      <HeatmapCells cornerRadius={2} />
      <HeatmapXAxis top={18} tickEvery={2} />
      <HeatmapYearHint />
      <HeatmapYAxis tickFilter="all" />
      <HeatmapTooltip showDelay={150} hideDelay={100} formatLabel={formatLabel} />
    </HeatmapChart>
  );
});

function buildSkeletonActivityPeriods(
  since?: string,
  until?: string,
): { period: string; month: number; count: number }[] {
  // 'YYYY-MM-DD' alone is parsed as UTC per spec; +'T00:00:00' forces local-time
  // parsing so the skeleton months align with the real since…until range
  // (matching commitStatsToHeatmapColumns in chartDataAdapters).
  const end = until ? new Date(until + 'T00:00:00') : new Date();
  const start = since
    ? new Date(since + 'T00:00:00')
    : new Date(end.getFullYear(), end.getMonth() - 11, 1);
  const periods: { period: string; month: number; count: number }[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    periods.push({
      period: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      month: cursor.getMonth() + 1,
      count: 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return periods;
}
