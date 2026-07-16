import React, { useCallback, useMemo } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import {
  HeatmapChart,
  HeatmapCells,
  HeatmapXAxis,
  HeatmapYAxis,
  HeatmapTooltip,
} from '@/components/charts/heatmap';
import { generateClockHeatmapData } from '../data/gitVisMockData';

const DAY_LABELS: string[] = (() => {
  const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
  return Array.from({ length: 7 }, (_, i) => dayFmt.format(new Date(2026, 0, 4 + i)));
})();

export const ClockHeatmap = React.memo(function ClockHeatmap() {
  const { t } = useTCopy();
  const data = useMemo(() => generateClockHeatmapData(), []);

  const formatLabel = useCallback(
    (count: number) => {
      const word = count === 1 ? t.gitVisCommits : t.gitVisCommits;
      return `${count} ${word}`;
    },
    [t]
  );

  return (
    <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
      <HeatmapChart
        data={data}
        rowLabels={DAY_LABELS}
        margin={{ top: 28, right: 16, bottom: 0, left: 40 }}
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
