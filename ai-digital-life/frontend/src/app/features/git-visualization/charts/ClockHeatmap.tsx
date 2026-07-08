import React, { useMemo } from 'react';
import type { EChartsOption } from '../echartsSetup';
import { useECharts } from '../hooks/useECharts';
import { useChartTheme } from '../hooks/useChartTheme';
import { clockHeatmapData } from '../data/gitVisMockData';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export const ClockHeatmap = React.memo(function ClockHeatmap() {
  const theme = useChartTheme();
  const { t } = useTCopy();

  const option = useMemo<EChartsOption>(() => {
    const days = [
      t.gitVisChartDaySun,
      t.gitVisChartDayMon,
      t.gitVisChartDayTue,
      t.gitVisChartDayWed,
      t.gitVisChartDayThu,
      t.gitVisChartDayFri,
      t.gitVisChartDaySat,
    ];
    return {
      tooltip: {
        backgroundColor: theme.tooltipBg,
        textStyle: { color: theme.tooltipText },
        formatter: (params: unknown) => {
          const p = params as { value: [number, number, number] };
          return `${days[p.value[1]]} ${p.value[0]}:00<br/>${formatT(t, 'gitVisChartTooltipCommitCount', { value: p.value[2] })}`;
        },
      },
      visualMap: {
        min: 0,
        max: 8,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        text: [t.gitVisChartLegendMany, t.gitVisChartLegendFew],
        textStyle: { fontSize: 10, color: theme.labelColor },
        inRange: {
          color: theme.heatmapColors,
        },
      },
      xAxis: {
        type: 'category',
        data: HOURS.map((h) => h + 'h'),
        splitLine: { show: false },
        axisLabel: { fontSize: 9, interval: 2, color: theme.labelColor },
        axisLine: { lineStyle: { color: theme.axisLineColor } },
      },
      yAxis: {
        type: 'category',
        data: days,
        splitLine: { show: false },
        axisLabel: { fontSize: 10, color: theme.labelColor },
        axisLine: { lineStyle: { color: theme.axisLineColor } },
      },
      series: [
        {
          type: 'heatmap',
          data: clockHeatmapData,
          emphasis: {
            itemStyle: {
              borderColor: theme.tooltipText,
              borderWidth: 1,
            },
          },
        },
      ],
    };
  }, [theme, t]);

  const ref = useECharts(option);
  return <div ref={ref} className="adl-git-vis__chart" />;
});
