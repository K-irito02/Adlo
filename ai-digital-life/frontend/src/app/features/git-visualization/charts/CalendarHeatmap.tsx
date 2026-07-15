import React, { useCallback, useMemo } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import {
  HeatmapChart,
  HeatmapCells,
  HeatmapXAxis,
  HeatmapYAxis,
  HeatmapTooltip,
} from '@/components/charts/heatmap';
import { toHeatmapColumns } from '../data/gitVisMockData';

export const CalendarHeatmap = React.memo(function CalendarHeatmap() {
  const { t } = useTCopy();
  const data = useMemo(() => toHeatmapColumns(), []);

  const formatLabel = useCallback(
    (count: number) => {
      const word = count === 1 ? t.gitVisContribution : t.gitVisContributions;
      return `${count} ${word}`;
    },
    [t]
  );

  return (
    <div style={{ width: '100%', minHeight: 160 }}>
      <HeatmapChart
        data={data}
        margin={{ top: 28, right: 16, bottom: 0, left: 40 }}
        gap={2}
        animate={true}
      >
        <HeatmapCells cornerRadius={2} />
        <HeatmapXAxis />
        <HeatmapYAxis tickFilter="odd" labelFormat="initial" />
        <HeatmapTooltip showDelay={150} hideDelay={100} formatLabel={formatLabel} />
      </HeatmapChart>
    </div>
  );
});
