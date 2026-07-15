import React, { useMemo } from 'react';
import { hierarchy, partition } from 'd3-hierarchy';
import { arc } from 'd3-shape';
import { Group } from '@visx/group';
import { useBklitTheme } from '../hooks/useBklitTheme';
import { fileTreemapData } from '../data/gitVisMockData';

interface FileNode {
  name: string;
  value?: number;
  children?: FileNode[];
}

const W = 300;
const H = 300;
const R = Math.min(W, H) / 2;

export const FileSunburst = React.memo(function FileSunburst() {
  const theme = useBklitTheme();

  const arcs = useMemo(() => {
    const root = hierarchy(fileTreemapData as FileNode).sum(
      (d) => d.value ?? 0
    );
    partition<unknown>().size([2 * Math.PI, R])(root);
    const makeArc = arc<{ x0: number; x1: number; y0: number; y1: number }>()
      .startAngle((d) => d.x0)
      .endAngle((d) => d.x1)
      .innerRadius((d) => d.y0)
      .outerRadius((d) => d.y1);
    return root
      .descendants()
      .filter((d) => d.depth > 0)
      .map((d, i) => ({
        path: makeArc(d),
        color: theme.seriesColors[i % theme.seriesColors.length],
        name: (d.data as FileNode).name,
      }));
  }, [theme]);

  return (
    <div className="adl-git-vis__chart">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Group top={H / 2} left={W / 2}>
          {arcs.map(
            (a, i) =>
              a.path && (
                <path key={i} d={a.path} fill={a.color} stroke={theme.background} strokeWidth={1} />
              )
          )}
        </Group>
      </svg>
    </div>
  );
});
