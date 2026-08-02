import React, { useMemo } from 'react';
import { SunburstChart } from '@/components/charts/sunburst-chart';
import type { ArcDatum, Focus, SunburstNode } from '@/components/charts/sunburst-chart';
import { SunburstSegment } from '@/components/charts/sunburst-segment';
import { SunburstCenter } from '@/components/charts/sunburst-center';
import {
  SunburstBreadcrumb,
  useSunburstBreadcrumbItems,
} from '@/components/charts/sunburst-breadcrumb';
import { SunburstHint } from '@/components/charts/sunburst-hint';
import { ModuleBreadcrumb } from '@/app/features/git-visualization/ModuleBreadcrumb';
import { adaptHotspotsTree, computeArcFill } from '../adapters/chartDataAdapters';
import type { GitVisFileHotspots } from '@/shared/ipc/workspace';
import type { HotspotColorMode } from '../hooks/useFileHotspotsState';
import { useTCopy } from '@i18n/useTCopy';

interface HotspotArcMeta {
  changeCount: number;
  additions: number;
  deletions: number;
  lastModified: string | null;
}

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

interface FileSunburstHintTextProps {
  hoveredArc: ArcDatum | null;
  focus: Focus;
  arcMeta: Map<number, HotspotArcMeta>;
}

function FileSunburstHintText({ hoveredArc, focus, arcMeta }: FileSunburstHintTextProps) {
  const { t } = useTCopy();
  const text = (() => {
    if (hoveredArc) {
      const meta = arcMeta.get(hoveredArc.arcIndex);
      if (meta) {
        const trail = hoveredArc.trail.join('  ›  ');
        return `${trail}  ·  ${meta.changeCount} ${t.gitVisHotspotsTooltipChanges?.replace('{count}', '') ?? ''}`;
      }
      return hoveredArc.trail.join('  ›  ');
    }
    if (focus.depth > 0) {
      return t.gitVisSunburstHintZoomOut;
    }
    return t.gitVisSunburstHintZoomIn;
  })();
  return (
    <div className="adl-file-sunburst-hint" style={{ minHeight: 20 }}>
      {text}
    </div>
  );
}

export interface FileSunburstChartProps {
  data?: GitVisFileHotspots;
  colorMode: HotspotColorMode;
  onDrill?: (path: string[]) => void;
  zoomToRootRef?: React.MutableRefObject<(() => void) | null>;
}

// Renders inside <SunburstChart> so it can access the sunburst context.
// Wires zoomToRootRef and onDrill to breadcrumb state.
function FileSunburstDrillBridge({
  onDrill,
  zoomToRootRef,
}: {
  onDrill?: (path: string[]) => void;
  zoomToRootRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const { items, zoomTo } = useSunburstBreadcrumbItems();

  // Wire zoomToRootRef for parent to call
  React.useEffect(() => {
    if (zoomToRootRef) {
      zoomToRootRef.current = () => {
        if (items.length > 0) {
          zoomTo(items[0].id);
        }
      };
    }
  }, [zoomToRootRef, zoomTo, items]);

  // Notify parent when drill path changes
  React.useEffect(() => {
    if (!onDrill) {
      return;
    }
    const path = items.slice(1).map((it) => it.label);
    onDrill(path);
  }, [items, onDrill]);

  return null;
}

export const FileSunburstChart = React.memo(function FileSunburstChart({
  data,
  colorMode,
  onDrill,
  zoomToRootRef,
}: FileSunburstChartProps) {
  const { tree: treeData, arcMeta } = useMemo(() => {
    if (!data?.tree) {
      return { tree: null, arcMeta: new Map<number, HotspotArcMeta>() };
    }
    return adaptHotspotsTree(data.tree, colorMode);
  }, [data, colorMode]);

  const allMetas = useMemo(() => Array.from(arcMeta.values()), [arcMeta]);

  const segments = useMemo(() => {
    if (!treeData) {
      return [];
    }
    const n = countDescendants(treeData);
    return Array.from({ length: n }, (_, i) => {
      const meta = arcMeta.get(i);
      const fill = meta ? computeArcFill(meta, colorMode, allMetas) : undefined;
      const tooltipText = meta
        ? `${treeData.name}\n${meta.changeCount} changes\n+${meta.additions} / -${meta.deletions}\n${meta.lastModified ?? ''}`
        : undefined;
      return <SunburstSegment key={i} index={i} fill={fill} tooltipText={tooltipText} />;
    });
  }, [treeData, arcMeta, allMetas, colorMode]);

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
      className="adl-git-vis__chart adl-file-sunburst--hotspots"
      style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}
    >
      <SunburstChart data={treeData} size={320}>
        <FileSunburstDrillBridge onDrill={onDrill} zoomToRootRef={zoomToRootRef} />
        <SunburstBreadcrumb className="adl-file-sunburst-breadcrumb">
          <FileSunburstBreadcrumbContent />
        </SunburstBreadcrumb>
        <SunburstCenter />
        {segments}
        <SunburstHint>
          {({ hoveredArc, focus }) => (
            <FileSunburstHintText hoveredArc={hoveredArc} focus={focus} arcMeta={arcMeta} />
          )}
        </SunburstHint>
      </SunburstChart>
    </div>
  );
});
