import React, { useCallback, useMemo } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import {
  HeatmapChart,
  HeatmapCells,
  HeatmapXAxis,
  HeatmapYAxis,
  HeatmapTooltip,
} from '@/components/charts/heatmap';
import { hourlyDistributionToHeatmapColumns } from '../adapters/chartDataAdapters';

interface ClockHeatmapProps {
  data?: { day: number; hour: number; count: number }[];
}

export const ClockHeatmap = React.memo(function ClockHeatmap({ data }: ClockHeatmapProps) {
  const { t, locale } = useTCopy();
  const dayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2026, 0, 4 + i)),
      ),
    [locale],
  );
  const heatmapData = useMemo(() => (data ? hourlyDistributionToHeatmapColumns(data) : []), [data]);

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
        data={heatmapData}
        rowLabels={dayLabels}
        locale={locale}
        margin={{ top: 28, right: 16, bottom: 0, left: 40 }}
        gap={2}
        binSize={30}
        animate={true}
      >
        <HeatmapCells cornerRadius={2} />
        <HeatmapXAxis tickEvery={2} />
        <HeatmapYAxis />
        <HeatmapTooltip showDelay={150} hideDelay={100} formatLabel={formatLabel} />
      </HeatmapChart>
    </div>
  );
});
