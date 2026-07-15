import React, { useMemo } from 'react';
import { Sankey } from '@visx/sankey';
import { useBklitTheme } from '../hooks/useBklitTheme';
import { toBklitSankeyData } from '../data/gitVisMockData';

const WIDTH = 600;
const HEIGHT = 300;

export const CollabSankey = React.memo(function CollabSankey() {
  const theme = useBklitTheme();
  const { nodes, links } = useMemo(() => toBklitSankeyData(), []);

  return (
    <div className="adl-git-vis__chart">
      <svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <Sankey
          root={{ nodes, links }}
          nodeWidth={20}
          nodePadding={10}
          size={[WIDTH, HEIGHT]}
          nodeId={(d: { id: string }) => d.id}
        >
          {({ graph, createPath }) => (
            <>
              {graph.nodes.map((node, i) => (
                <rect
                  key={i}
                  x={node.x0}
                  y={node.y0}
                  width={node.x1! - node.x0!}
                  height={node.y1! - node.y0!}
                  fill={theme.seriesColors[i % theme.seriesColors.length]}
                  rx={3}
                />
              ))}
              {graph.links.map((link, i) => (
                <path
                  key={i}
                  d={createPath(link) ?? ''}
                  stroke={theme.muted}
                  strokeWidth={Math.max(1, link.width ?? 1)}
                  fill="none"
                  opacity={0.6}
                />
              ))}
            </>
          )}
        </Sankey>
      </svg>
    </div>
  );
});
