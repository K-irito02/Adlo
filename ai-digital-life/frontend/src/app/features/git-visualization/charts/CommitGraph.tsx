import React, { useMemo } from 'react';
import type { EChartsOption } from '../echartsSetup';
import { useECharts } from '../hooks/useECharts';
import { useChartTheme } from '../hooks/useChartTheme';
import { getBranchColor } from '../utils/branchColor';
import { commitNodes, commitEdges, allBranches } from '../data/gitVisMockData';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';

export const CommitGraph = React.memo(function CommitGraph() {
  const theme = useChartTheme();
  const { t } = useTCopy();

  const option = useMemo<EChartsOption>(
    () => ({
      tooltip: {
        trigger: 'item',
        backgroundColor: theme.tooltipBg,
        textStyle: { color: theme.tooltipText },
        formatter: (params: unknown) => {
          const p = params as { dataType: string; data: { name: string; category?: string } };
          if (p.dataType === 'node') {
            return `${formatT(t, 'gitVisChartCommitTooltipNode', { name: p.data.name })}<br/>${formatT(t, 'gitVisChartCommitTooltipBranch', { branch: p.data.category ?? '' })}`;
          }
          return t.gitVisChartCommitTooltipEdge;
        },
      },
      legend: {
        data: allBranches,
        orient: 'horizontal',
        left: 'left',
        bottom: 0,
        icon: 'circle',
        textStyle: { fontSize: 11, color: theme.labelColor },
      },
      series: [
        {
          type: 'graph',
          layout: 'force',
          force: {
            repulsion: 300,
            edgeLength: [80, 150],
            gravity: 0.1,
            friction: 0.1,
          },
          roam: true,
          draggable: true,
          data: commitNodes.map((n) => ({
            id: n.id,
            name: n.name,
            symbolSize: 28,
            category: n.branch,
            itemStyle: { color: getBranchColor(n.branch, allBranches) },
            label: { show: true, position: 'bottom', fontSize: 10, color: theme.labelColor },
          })),
          links: commitEdges,
          categories: allBranches.map((b) => ({
            name: b,
            itemStyle: { color: getBranchColor(b, allBranches) },
          })),
          edgeSymbol: ['none', 'arrow'],
          edgeSymbolSize: [0, 10],
          lineStyle: {
            color: theme.neutralColor,
            width: 2,
            curveness: 0.2,
          },
          emphasis: {
            focus: 'adjacency',
            lineStyle: { width: 3 },
          },
        },
      ],
    }),
    [theme, t]
  );

  const ref = useECharts(option);
  return <div ref={ref} className="adl-git-vis__chart" />;
});
