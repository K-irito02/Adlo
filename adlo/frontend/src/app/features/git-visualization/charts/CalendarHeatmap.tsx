import React, { useCallback, useMemo } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import type { ChartStatus } from '@/components/charts/chart-phase';
import {
  HeatmapChart,
  HeatmapCells,
  HeatmapXAxis,
  HeatmapYAxis,
  HeatmapTooltip,
  buildHeatmapFillScale,
  generateHeatmapSkeletonFromTarget,
  HEATMAP_DEFAULT_LEVEL_STYLES,
  type HeatmapLevelResolver,
} from '@/components/charts/heatmap';
import { commitStatsToHeatmapColumns } from '../adapters/chartDataAdapters';

/**
 * Commit-calendar cell bounds. 53 week columns keep the grid readable from a
 * ~530px container down (min) without growing past the GitHub-style look on
 * wide panels (max). Loading and ready branches share these so the skeleton
 * never jumps in size when the real data arrives.
 */
const CALENDAR_CELL_BOUNDS = { min: 10, max: 14 } as const;

function expandToFullYear(
  dailyCommits: { date: string; count: number }[],
  year: number,
): { date: string; count: number }[] {
  const countMap = new Map(dailyCommits.map((d) => [d.date, d.count]));
  const result: { date: string; count: number }[] = [];
  for (let month = 0; month < 12; month++) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const y = String(year);
      const m = String(month + 1).padStart(2, '0');
      const d = String(day).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;
      result.push({ date: dateStr, count: countMap.get(dateStr) ?? 0 });
    }
  }
  return result;
}

const dayFmt = (locale: string) =>
  [0, 1, 2, 3, 4, 5, 6].map((offset) =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(new Date(2026, 0, 4 + offset)),
  );

interface CalendarHeatmapProps {
  data?: { date: string; count: number }[];
  /** When set, expands data to all 365/366 days of the year so heatmap shows all weeks */
  year?: number;
  status?: ChartStatus;
  loadingLabel?: string;
  /** Dataset-aware count → level resolver shared with the card legend. */
  levelForCount?: HeatmapLevelResolver;
}

export const CalendarHeatmap = React.memo(function CalendarHeatmap({
  data,
  year,
  status = 'ready',
  loadingLabel,
  levelForCount,
}: CalendarHeatmapProps) {
  const { t, locale } = useTCopy();
  const expandedData = useMemo(() => {
    if (!data) {
      return undefined;
    }
    if (year !== undefined) {
      const full = expandToFullYear(data, year);
      return full;
    }
    return data;
  }, [data, year]);
  const heatmapData = useMemo(() => {
    if (!expandedData) {
      return [];
    }
    const columns = commitStatsToHeatmapColumns(expandedData);
    if (year !== undefined) {
      return columns.map((col) => ({
        ...col,
        bins: col.bins.map((b) =>
          b.date && b.date.getFullYear() !== year ? { ...b, date: undefined, count: -1 } : b,
        ),
      }));
    }
    return columns;
  }, [expandedData, year]);
  const skeletonYear = year ?? new Date().getFullYear();
  const skeletonTarget = useMemo(() => {
    return commitStatsToHeatmapColumns(expandToFullYear([], skeletonYear));
  }, [skeletonYear]);
  const skeletonData = useMemo(
    () => generateHeatmapSkeletonFromTarget(skeletonTarget),
    [skeletonTarget],
  );
  const dayLabels = useMemo(() => dayFmt(locale), [locale]);

  const defaultFillScale = useMemo(() => buildHeatmapFillScale(HEATMAP_DEFAULT_LEVEL_STYLES), []);
  const customFillScale = useMemo(() => {
    const levelFillScale = buildHeatmapFillScale(HEATMAP_DEFAULT_LEVEL_STYLES, levelForCount);
    return (count: number | null | undefined) => {
      if (count === -1) {
        return 'transparent';
      }
      return levelFillScale(count);
    };
  }, [levelForCount]);

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
        rowLabels={dayLabels}
        margin={{ top: 24, right: 16, bottom: 0, left: 40 }}
        gap={2}
        minBinSize={CALENDAR_CELL_BOUNDS.min}
        maxBinSize={CALENDAR_CELL_BOUNDS.max}
        animate={true}
        fillScale={defaultFillScale}
      >
        <HeatmapCells cornerRadius={2} />
        <HeatmapXAxis labelFormat="numeric" />
        <HeatmapYAxis tickFilter="even" labelFormat="full" />
      </HeatmapChart>
    );
  }

  return (
    <HeatmapChart
      data={heatmapData}
      status={status}
      loadingLabel={loadingLabel}
      locale={locale}
      rowLabels={dayLabels}
      margin={{ top: 24, right: 16, bottom: 0, left: 40 }}
      gap={2}
      minBinSize={CALENDAR_CELL_BOUNDS.min}
      maxBinSize={CALENDAR_CELL_BOUNDS.max}
      animate={true}
      fillScale={customFillScale}
      levelForCount={levelForCount}
    >
      <HeatmapCells cornerRadius={2} />
      <HeatmapXAxis labelFormat="numeric" />
      <HeatmapYAxis tickFilter="even" labelFormat="full" />
      <HeatmapTooltip showDelay={150} hideDelay={100} formatLabel={formatLabel} />
    </HeatmapChart>
  );
});
