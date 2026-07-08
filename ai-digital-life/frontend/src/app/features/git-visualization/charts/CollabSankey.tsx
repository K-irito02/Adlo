import React, { useMemo } from 'react';
import type { EChartsOption } from '../echartsSetup';
import { useECharts } from '../hooks/useECharts';
import { useChartTheme } from '../hooks/useChartTheme';
import { sankeyNodes, sankeyLinks } from '../data/gitVisMockData';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';

export const CollabSankey = React.memo(function CollabSankey() {
  const theme = useChartTheme();
  const { t } = useTCopy();

  const option = useMemo<EChartsOption>(
    () => ({
      tooltip: {
        trigger: 'item',
        triggerOn: 'mousemove',
        backgroundColor: theme.tooltipBg,
        textStyle: { color: theme.tooltipText },
        formatter: (params: unknown) => {
          const p = params as {
            dataType: string;
            data: { source?: string; target?: string; name?: string; value?: number };
          };
          if (p.dataType === 'edge') {
            return `${p.data.source} → ${p.data.target}<br/>${formatT(t, 'gitVisChartTooltipContribution', { value: p.data.value ?? 0 })}`;
          }
          return `${p.data.name}<br/>${formatT(t, 'gitVisChartTooltipTotal', { value: p.data.value ?? 0 })}`;
        },
      },
      series: [
        {
          type: 'sankey',
          layout: 'none',
          emphasis: { focus: 'adjacency' },
          data: sankeyNodes,
          links: sankeyLinks,
          label: {
            fontSize: 11,
            color: theme.labelColor,
          },
          lineStyle: {
            color: 'gradient',
            curveness: 0.5,
          },
          itemStyle: {
            borderColor: theme.treemapBorderColor,
            borderWidth: 1,
          },
        },
      ],
    }),
    [theme, t]
  );

  const ref = useECharts(option);
  return <div ref={ref} className="adl-git-vis__chart" />;
});
