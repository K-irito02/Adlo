import React, { useMemo } from 'react';
import { SunburstChart } from '@/components/charts/sunburst-chart';
import type { SunburstNode } from '@/components/charts/sunburst-chart';
import { SunburstSegment } from '@/components/charts/sunburst-segment';
import { SunburstCenter } from '@/components/charts/sunburst-center';
import { adaptSunburstData } from '../adapters/chartDataAdapters';

function countDescendants(node: SunburstNode): number {
  if (!node.children) {
    return 0;
  }
  let count = node.children.length;
  for (const child of node.children) {
    if (child.children) {
      count += countDescendants(child);
    }
  }
  return count;
}

interface FileSunburstProps {
  data?: unknown;
}

export const FileSunburst = React.memo(function FileSunburst({ data }: FileSunburstProps) {
  const treeData = useMemo(() => (data ? (adaptSunburstData(data) as SunburstNode) : null), [data]);
  const segments = useMemo(() => {
    if (!treeData) {
      return [];
    }
    const n = countDescendants(treeData);
    return Array.from({ length: n }, (_, i) => <SunburstSegment key={i} index={i} />);
  }, [treeData]);

  if (!treeData) {
    return (
      <div
        className="adl-git-vis__chart"
        style={{ position: 'relative', display: 'flex', justifyContent: 'center', padding: 16 }}
      >
        <p style={{ color: 'var(--text-muted)' }}>No data</p>
      </div>
    );
  }

  return (
    <div
      className="adl-git-vis__chart"
      style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}
    >
      <SunburstChart data={treeData} size={320}>
        <SunburstCenter />
        {segments}
      </SunburstChart>
    </div>
  );
});
