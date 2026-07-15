import React, { useMemo } from 'react';
import { SankeyChart } from '@/components/charts/sankey/sankey-chart';
import { SankeyNode } from '@/components/charts/sankey/sankey-node';
import { SankeyLink } from '@/components/charts/sankey/sankey-link';
import { SankeyTooltip } from '@/components/charts/sankey/sankey-tooltip';
import { useBklitTheme } from '../hooks/useBklitTheme';
import { toBklitSankeyChartData } from '../data/gitVisMockData';

export const CollabSankey = React.memo(function CollabSankey() {
  const theme = useBklitTheme();
  const data = useMemo(() => toBklitSankeyChartData(), []);

  return (
    <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
      <SankeyChart data={data}>
        <SankeyNode getNodeColor={(node, i) => theme.seriesColors[i % theme.seriesColors.length]} />
        <SankeyLink />
        <SankeyTooltip />
      </SankeyChart>
    </div>
  );
});
