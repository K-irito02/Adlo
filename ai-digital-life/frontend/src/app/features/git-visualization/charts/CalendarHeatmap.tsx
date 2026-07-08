import React, { useMemo } from 'react';
import type { EChartsOption } from '../echartsSetup';
import { useECharts } from '../hooks/useECharts';
import { useChartTheme } from '../hooks/useChartTheme';
import { generateCalendarData } from '../data/gitVisMockData';
import { useTCopy } from '@i18n/useTCopy';

export const CalendarHeatmap = React.memo(function CalendarHeatmap() {
  const theme = useChartTheme();
  const { t } = useTCopy();
  const data = useMemo(() => generateCalendarData(), []);

  const option = useMemo<EChartsOption>(
    () => ({
      tooltip: {
        backgroundColor: theme.tooltipBg,
        textStyle: { color: theme.tooltipText },
      },
      visualMap: {
        min: 0,
        max: 7,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        text: [t.gitVisChartLegendHigh, t.gitVisChartLegendLow],
        textStyle: { fontSize: 10, color: theme.labelColor },
        inRange: {
          color: theme.heatmapColors,
        },
      },
      calendar: {
        range: ['2025-07-01', '2026-06-30'],
        cellSize: ['auto', 16],
        splitLine: { show: false },
        itemStyle: {
          borderWidth: 0.5,
          borderColor: theme.splitLineColor,
        },
        yearLabel: { show: true, fontSize: 12, color: theme.labelColor },
        monthLabel: { show: true, fontSize: 10, color: theme.labelColor },
        dayLabel: { color: theme.labelColor },
      },
      series: [
        {
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data,
        },
      ],
    }),
    [theme, t, data]
  );

  const ref = useECharts(option);
  return <div ref={ref} className="adl-git-vis__chart" />;
});
