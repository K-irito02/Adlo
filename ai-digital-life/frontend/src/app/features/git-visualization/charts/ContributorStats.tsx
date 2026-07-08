import React, { useMemo } from 'react';
import type { EChartsOption } from '../echartsSetup';
import { useECharts } from '../hooks/useECharts';
import { useChartTheme } from '../hooks/useChartTheme';
import {
  contributorNames,
  contributorCommits,
  contributorAdded,
  contributorDeleted,
} from '../data/gitVisMockData';
import { useTCopy } from '@i18n/useTCopy';

export const ContributorStats = React.memo(function ContributorStats() {
  const theme = useChartTheme();
  const { t } = useTCopy();

  const option = useMemo<EChartsOption>(
    () => ({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: theme.tooltipBg,
        textStyle: { color: theme.tooltipText },
      },
      legend: {
        data: [t.gitVisChartSeriesCommits, t.gitVisChartSeriesAdded, t.gitVisChartSeriesDeleted],
        left: 'left',
        top: 0,
        icon: 'roundRect',
        textStyle: { fontSize: 11, color: theme.labelColor },
      },
      grid: {
        left: '8%',
        right: '12%',
        top: '18%',
        bottom: '12%',
      },
      xAxis: {
        type: 'category',
        data: contributorNames,
        axisLabel: { fontSize: 11, color: theme.labelColor },
        axisLine: { lineStyle: { color: theme.axisLineColor } },
      },
      yAxis: [
        {
          type: 'value',
          name: t.gitVisChartSeriesCommits,
          nameTextStyle: { fontSize: 10, color: theme.labelColor },
          axisLabel: { fontSize: 10, color: theme.labelColor },
          axisLine: { lineStyle: { color: theme.axisLineColor } },
          splitLine: { lineStyle: { color: theme.splitLineColor } },
        },
        {
          type: 'value',
          name: t.gitVisChartSeriesCodeLines,
          nameTextStyle: { fontSize: 10, color: theme.labelColor },
          axisLabel: { fontSize: 10, color: theme.labelColor },
          axisLine: { lineStyle: { color: theme.axisLineColor } },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: t.gitVisChartSeriesCommits,
          type: 'bar',
          data: contributorCommits,
          itemStyle: { color: theme.commitColor },
          barWidth: 20,
        },
        {
          name: t.gitVisChartSeriesAdded,
          type: 'line',
          yAxisIndex: 1,
          data: contributorAdded,
          smooth: true,
          lineStyle: { color: theme.addColor, width: 2 },
          symbol: 'circle',
          symbolSize: 8,
          itemStyle: { color: theme.addColor },
        },
        {
          name: t.gitVisChartSeriesDeleted,
          type: 'line',
          yAxisIndex: 1,
          data: contributorDeleted,
          smooth: true,
          lineStyle: { color: theme.deleteColor, width: 2, type: 'dashed' },
          symbol: 'diamond',
          symbolSize: 8,
          itemStyle: { color: theme.deleteColor },
        },
      ],
    }),
    [theme, t]
  );

  const ref = useECharts(option);
  return <div ref={ref} className="adl-git-vis__chart" />;
});
