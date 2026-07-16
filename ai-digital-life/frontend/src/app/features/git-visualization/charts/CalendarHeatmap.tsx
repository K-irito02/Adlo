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

const dayFmt = (locale: string) =>
  Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2026, 0, 4 + i))
  );

export const CalendarHeatmap = React.memo(function CalendarHeatmap() {
  const { t, locale } = useTCopy();
  const data = useMemo(() => toHeatmapColumns(), []);
  const dayLabels = useMemo(() => dayFmt(locale), [locale]);

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
        locale={locale}
        rowLabels={dayLabels}
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
