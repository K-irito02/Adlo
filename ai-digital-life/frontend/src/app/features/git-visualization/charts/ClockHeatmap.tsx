import React, { useCallback, useMemo } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import {
  HeatmapChart,
  HeatmapCells,
  HeatmapXAxis,
  HeatmapYAxis,
  HeatmapTooltip,
  buildHeatmapFillScale,
  HEATMAP_DEFAULT_LEVEL_STYLES,
} from '@/components/charts/heatmap';
import { hourlyDistributionToHeatmapColumns } from '../adapters/chartDataAdapters';

interface ClockHeatmapProps {
  data?: { day: number; hour: number; count: number }[];
}

function expandToFullGrid(
  hourlyData: { day: number; hour: number; count: number }[],
): { day: number; hour: number; count: number }[] {
  const countMap = new Map(hourlyData.map((d) => `${d.hour}-${d.day}`));
  const result: { day: number; hour: number; count: number }[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let day = 0; day < 7; day++) {
      const key = `${hour}-${day}`;
      if (countMap.has(key)) {
        result.push({ hour, day, count: countMap.get(key)! });
      } else {
        result.push({ hour, day, count: -1 });
      }
    }
  }
  return result;
}

export const ClockHeatmap = React.memo(function ClockHeatmap({ data }: ClockHeatmapProps) {
  const { t, locale } = useTCopy();
  const dayLabels = useMemo(
    () =>
      [0, 1, 2, 3, 4, 5, 6].map((offset) =>
        new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2026, 0, 4 + offset)),
      ),
    [locale],
  );
  const expandedData = useMemo(() => (data ? expandToFullGrid(data) : undefined), [data]);
  const heatmapData = useMemo(
    () => (expandedData ? hourlyDistributionToHeatmapColumns(expandedData) : []),
    [expandedData],
  );

  const defaultFillScale = useMemo(
    () => buildHeatmapFillScale(HEATMAP_DEFAULT_LEVEL_STYLES),
    [],
  );
  const customFillScale = useCallback(
    (count: number | null | undefined) => {
      if (count === -1) return 'transparent';
      return defaultFillScale(count);
    },
    [defaultFillScale],
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
        data={heatmapData}
        rowLabels={dayLabels}
        locale={locale}
        margin={{ top: 28, right: 16, bottom: 0, left: 40 }}
        gap={2}
        binSize={30}
        animate={true}
        fillScale={customFillScale}
      >
        <HeatmapCells cornerRadius={2} />
        <HeatmapXAxis tickEvery={2} />
        <HeatmapYAxis />
        <HeatmapTooltip showDelay={150} hideDelay={100} formatLabel={formatLabel} />
      </HeatmapChart>
    </div>
  );
});
