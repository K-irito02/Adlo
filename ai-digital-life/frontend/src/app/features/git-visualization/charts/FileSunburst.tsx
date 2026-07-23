import React, { useMemo } from 'react';
import { SunburstChart } from '@/components/charts/sunburst-chart';
import { SunburstSegment } from '@/components/charts/sunburst-segment';
import { SunburstCenter } from '@/components/charts/sunburst-center';
import { fileTreemapData } from '../data/gitVisMockData';

function countDescendants(node: { children?: { children?: unknown }[] }): number {
  if (!node.children) {
    return 0;
  }
  let count = node.children.length;
  for (const child of node.children) {
    if ('children' in child) {
      count += countDescendants(child as { children?: { children?: unknown }[] });
    }
  }
  return count;
}

export const FileSunburst = React.memo(function FileSunburst() {
  const segments = useMemo(() => {
    const n = countDescendants(fileTreemapData);
    return Array.from({ length: n }, (_, i) => <SunburstSegment key={i} index={i} />);
  }, []);
  return (
    <div
      className="adl-git-vis__chart"
      style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}
    >
      <SunburstChart data={fileTreemapData} size={320}>
        <SunburstCenter />
        {segments}
      </SunburstChart>
    </div>
  );
});
