import React, { useMemo } from 'react';
import { SunburstChart } from '@/components/charts/sunburst-chart';
import type { SunburstNode, ArcDatum, Focus } from '@/components/charts/sunburst-chart';
import { SunburstSegment } from '@/components/charts/sunburst-segment';
import { SunburstCenter } from '@/components/charts/sunburst-center';
import {
  SunburstBreadcrumb,
  useSunburstBreadcrumbItems,
} from '@/components/charts/sunburst-breadcrumb';
import { SunburstHint } from '@/components/charts/sunburst-hint';
import { ModuleBreadcrumb } from '../ModuleBreadcrumb';
import { adaptSunburstData } from '../adapters/chartDataAdapters';
import { useTCopy } from '@i18n/useTCopy';

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

function FileSunburstBreadcrumbContent() {
  const { items, zoomTo } = useSunburstBreadcrumbItems();

  if (items.length <= 1) {
    return null;
  }

  const pathSegments = items.slice(1).map((it) => it.label);

  const handleNavigate = (level: number) => {
    const targetIndex = level === -1 ? 0 : level + 1;
    const target = items[targetIndex];
    if (target) {
      zoomTo(target.id);
    }
  };

  return <ModuleBreadcrumb pathSegments={pathSegments} onNavigate={handleNavigate} />;
}

function FileSunburstHintText({
  hoveredArc,
  focus,
}: {
  hoveredArc: ArcDatum | null;
  focus: Focus;
}) {
  const { t } = useTCopy();

  const text = (() => {
    if (hoveredArc) {
      return hoveredArc.trail.join('  ›  ');
    }
    if (focus.depth > 0) {
      return t.gitVisSunburstHintZoomOut;
    }
    return t.gitVisSunburstHintZoomIn;
  })();

  return (
    <div aria-live="polite" className="adl-file-sunburst-hint" style={{ minHeight: 20 }}>
      {text}
    </div>
  );
}

interface FileSunburstProps {
  data?: unknown;
}

export const FileSunburst = React.memo(function FileSunburst({ data }: FileSunburstProps) {
  const treeData = useMemo(() => (data ? adaptSunburstData(data) : null), [data]);
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
      />
    );
  }

  return (
    <div
      className="adl-git-vis__chart"
      style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}
    >
      <SunburstChart data={treeData} size={320}>
        <SunburstBreadcrumb className="adl-file-sunburst-breadcrumb">
          <FileSunburstBreadcrumbContent />
        </SunburstBreadcrumb>
        <SunburstCenter />
        {segments}
        <SunburstHint>
          {({ hoveredArc, focus }) => (
            <FileSunburstHintText hoveredArc={hoveredArc} focus={focus} />
          )}
        </SunburstHint>
      </SunburstChart>
    </div>
  );
});
