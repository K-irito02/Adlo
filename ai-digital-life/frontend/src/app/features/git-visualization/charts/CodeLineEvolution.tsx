import React, { useMemo } from 'react';
import type { EChartsOption } from '../echartsSetup';
import { useECharts } from '../hooks/useECharts';
import { useChartTheme } from '../hooks/useChartTheme';
import { generateCodeLineEvolutionData } from '../data/gitVisMockData';
import { useTCopy } from '@i18n/useTCopy';

import { graphic } from '../echartsSetup';

export const CodeLineEvolution = React.memo(function CodeLineEvolution() {
  const theme = useChartTheme();
  const { t } = useTCopy();
  const { dates, added, deleted } = useMemo(() => generateCodeLineEvolutionData(), []);

  const option = useMemo<EChartsOption>(
    () => ({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        backgroundColor: theme.tooltipBg,
        textStyle: { color: theme.tooltipText },
      },
      legend: {
        data: [t.gitVisChartSeriesCumulativeAdded, t.gitVisChartSeriesCumulativeDeleted],
        left: 'left',
        top: 0,
        textStyle: { fontSize: 11, color: theme.labelColor },
      },
      grid: {
        left: '8%',
        right: '8%',
        top: '18%',
        bottom: '12%',
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: { fontSize: 9, interval: 3, color: theme.labelColor },
        axisLine: { lineStyle: { color: theme.axisLineColor } },
      },
      yAxis: {
        type: 'value',
        name: t.gitVisChartSeriesCodeLines,
        nameTextStyle: { fontSize: 10, color: theme.labelColor },
        axisLabel: { fontSize: 10, color: theme.labelColor },
        axisLine: { lineStyle: { color: theme.axisLineColor } },
        splitLine: { lineStyle: { color: theme.splitLineColor } },
      },
      series: [
        {
          name: t.gitVisChartSeriesCumulativeAdded,
          type: 'line',
          data: added,
          smooth: true,
          lineStyle: { color: theme.addColor, width: 3 },
          areaStyle: {
            color: new graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: theme.addColorAlpha },
              { offset: 1, color: 'transparent' },
            ]),
          },
          symbol: 'none',
        },
        {
          name: t.gitVisChartSeriesCumulativeDeleted,
          type: 'line',
          data: deleted,
          smooth: true,
          lineStyle: { color: theme.deleteColor, width: 3 },
          areaStyle: {
            color: new graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: theme.deleteColorAlpha },
              { offset: 1, color: 'transparent' },
            ]),
          },
          symbol: 'none',
        },
      ],
    }),
    [theme, t, dates, added, deleted]
  );

  const ref = useECharts(option);
  return <div ref={ref} className="adl-git-vis__chart" />;
});
