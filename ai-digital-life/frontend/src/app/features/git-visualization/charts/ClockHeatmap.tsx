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
  const entries: [string, number][] = hourlyData.map((d) => [`${d.hour}-${d.day}`, d.count]);
  const countMap = new Map(entries);
  const result: { day: number; hour: number; count: number }[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let day = 0; day < 7; day++) {
      const key = `${hour}-${day}`;
      if (countMap.has(key)) {
        result.push({ hour, day, count: countMap.get(key)! });
      } else {
        result.push({ hour, day, count: 0 });
      }
    }
  }
  return result;
}

export const ClockHeatmap = React.memo(function ClockHeatmap({ data }: ClockHeatmapProps) {
  const { t, locale, formatT } = useTCopy();
  const dayLabels = useMemo(
    () =>
      [0, 1, 2, 3, 4, 5, 6].map((offset) =>
        new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(
          new Date(2026, 0, 4 + offset),
        ),
      ),
    [locale],
  );
  const expandedData = useMemo(() => (data ? expandToFullGrid(data) : undefined), [data]);
  const rawColumns = useMemo(
    () => (expandedData ? hourlyDistributionToHeatmapColumns(expandedData, dayLabels) : []),
    [expandedData, dayLabels],
  );
  const weekdayNames = useMemo(
    () =>
      [0, 1, 2, 3, 4, 5, 6].map((offset) =>
        new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(new Date(2026, 0, 4 + offset)),
      ),
    [locale],
  );
  const heatmapData = useMemo(
    () =>
      rawColumns.map((col) => ({
        ...col,
        bins: col.bins.map((bin) => ({
          ...bin,
          tooltipTitle: formatT(t, 'gitVisHourRange', {
            start: String(col.bin).padStart(2, '0'),
            end: String((Number(col.bin) + 1) % 24).padStart(2, '0'),
          }),
          tooltipSubtitle: weekdayNames[bin.bin] ?? bin.tooltipSubtitle,
        })),
      })),
    [rawColumns, weekdayNames, t, formatT],
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
      data={heatmapData}
      rowLabels={dayLabels}
      locale={locale}
      margin={{ top: 24, right: 16, bottom: 0, left: 40 }}
      gap={2}
      binSize={30}
      animate={true}
      fillScale={customFillScale}
    >
      <HeatmapCells cornerRadius={2} />
      <HeatmapXAxis tickEvery={2} />
      <HeatmapYAxis tickFilter="even" />
      <HeatmapTooltip showDelay={150} hideDelay={100} formatLabel={formatLabel} />
    </HeatmapChart>
  );
});
