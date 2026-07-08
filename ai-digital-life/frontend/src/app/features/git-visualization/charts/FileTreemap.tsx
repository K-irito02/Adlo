import React, { useMemo } from 'react';
import type { EChartsOption } from '../echartsSetup';
import { useECharts } from '../hooks/useECharts';
import { useChartTheme } from '../hooks/useChartTheme';
import { fileTreemapData } from '../data/gitVisMockData';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';

export const FileTreemap = React.memo(function FileTreemap() {
  const theme = useChartTheme();
  const { t } = useTCopy();

  const option = useMemo<EChartsOption>(
    () => ({
      tooltip: {
        backgroundColor: theme.tooltipBg,
        textStyle: { color: theme.tooltipText },
        formatter: (info: unknown) => {
          const i = info as { name: string; value: number };
          return `<strong>${i.name}</strong><br/>${formatT(t, 'gitVisChartTooltipHeatmap', { value: i.value })}`;
        },
      },
      series: [
        {
          type: 'treemap',
          data: [fileTreemapData],
          leafDepth: 2,
          label: {
            show: true,
            position: 'inside',
            fontSize: 11,
            color: theme.treemapLabelColor,
            formatter: (info: { name: string }) =>
              info.name.length > 12 ? info.name.slice(0, 10) + '…' : info.name,
          },
          upperLabel: {
            show: true,
            position: 'inside',
            fontSize: 12,
            fontWeight: 'bold',
            color: theme.treemapLabelColor,
          },
          itemStyle: {
            borderColor: theme.treemapBorderColor,
            borderWidth: 2,
            gapWidth: 2,
          },
          emphasis: {
            itemStyle: {
              borderColor: theme.tooltipText,
              borderWidth: 3,
            },
          },
        },
      ],
    }),
    [theme, t]
  );

  const ref = useECharts(option);
  return <div ref={ref} className="adl-git-vis__chart" />;
});
