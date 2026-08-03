import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import {
  HeatmapChart,
  HeatmapCells,
  HeatmapXAxis,
  HeatmapYAxis,
  HeatmapTooltip,
  buildHeatmapFillScale,
  HEATMAP_DEFAULT_LEVEL_STYLES,
} from '@/components/charts/heatmap';
import type { HeatmapColumn } from '@/components/charts/heatmap';
import type { ChartStatus } from '@/components/charts/chart-phase';
import { ModuleBreadcrumb } from '../ModuleBreadcrumb';
import { ModuleTreeCard } from '../ModuleTreeCard';
import type { ColumnMeta } from '../moduleTreeUtils';
import { buildModuleTree, getChildrenAtPath, childrenToHeatmapColumns } from '../moduleTreeUtils';
import type { ModuleTreeNode } from '../moduleTreeUtils';

interface ContributorModuleHeatmapProps {
  data?: {
    author: string;
    authorEmail: string;
    modules: { module: string; count: number }[];
  }[];
  allPaths?: string[];
  status?: ChartStatus;
  loadingLabel?: string;
}

export const ContributorModuleHeatmap = React.memo(function ContributorModuleHeatmap({
  data,
  allPaths,
  status = 'ready',
  loadingLabel,
}: ContributorModuleHeatmapProps) {
  const { t, locale } = useTCopy();
  const [drillPath, setDrillPath] = useState<string[]>([]);
  const [treeCard, setTreeCard] = useState<{
    subtree: ModuleTreeNode[];
    position: { x: number; y: number };
    dir: { name: string; path: string };
  } | null>(null);

  const treeRef = useRef<ModuleTreeNode | null>(null);
  const prevAllPathsRef = useRef<string[] | undefined>(undefined);
  const drillCacheRef = useRef<
    Map<string, { columns: HeatmapColumn[]; rowLabels: string[]; columnMeta: ColumnMeta[] }>
  >(new Map());

  const customFillScale = useMemo(() => buildHeatmapFillScale(HEATMAP_DEFAULT_LEVEL_STYLES), []);

  useEffect(() => {
    drillCacheRef.current = new Map();
  }, [allPaths, data]);

  const { columns, rowLabels, columnMeta } = useMemo(() => {
    if (!data || !allPaths) {
      return {
        columns: [] as HeatmapColumn[],
        rowLabels: [] as string[],
        columnMeta: [] as ColumnMeta[],
      };
    }

    if (!treeRef.current || prevAllPathsRef.current !== allPaths) {
      treeRef.current = buildModuleTree(allPaths);
      prevAllPathsRef.current = allPaths;
    }

    const cacheKey = drillPath.join('/');
    const cached = drillCacheRef.current.get(cacheKey);
    if (cached) {
      return cached;
    }

    const children = getChildrenAtPath(treeRef.current, drillPath);
    if (children.length === 0) {
      return {
        columns: [] as HeatmapColumn[],
        rowLabels: [] as string[],
        columnMeta: [] as ColumnMeta[],
      };
    }
    const result = childrenToHeatmapColumns(children, data);
    drillCacheRef.current.set(cacheKey, result);
    return result;
  }, [data, allPaths, drillPath]);

  const handleColumnClick = useCallback((label: string) => {
    setDrillPath((prev) => [...prev, label]);
  }, []);

  const handleColumnContextMenu = useCallback(
    (label: string, x: number, y: number) => {
      if (!treeRef.current) {
        return;
      }
      const children = getChildrenAtPath(treeRef.current, drillPath);
      const node = children.find((c) => c.name === label);
      if (node?.isDir && node.children.length > 0) {
        setTreeCard({
          subtree: node.children,
          position: { x, y },
          dir: { name: node.name, path: node.path },
        });
      }
    },
    [drillPath],
  );

  const handleBreadcrumbNavigate = useCallback((level: number) => {
    if (level === -1) {
      setDrillPath([]);
    } else {
      setDrillPath((prev) => prev.slice(0, level + 1));
    }
  }, []);

  const handleTreeSelect = useCallback((path: string) => {
    const segments = path.split('/');
    if (treeRef.current) {
      let current = treeRef.current;
      let isFile = false;
      for (const seg of segments) {
        const found = current.children.find((c) => c.name === seg);
        if (!found) {
          break;
        }
        isFile = !found.isDir;
        current = found;
      }
      if (isFile && segments.length > 0) {
        segments.pop();
      }
    }
    setDrillPath(segments);
    setTreeCard(null);
  }, []);

  const colCount = columns.length;
  const rotateAngle = colCount > 0 ? 45 : 0;

  const { labelTop, marginTop } = useMemo(() => {
    if (colCount === 0) {
      return { labelTop: 0, marginTop: 24 };
    }
    const maxLabelLen = columns.reduce((max, col) => {
      const len = (col.columnLabel ?? '').length;
      return len > max ? len : max;
    }, 0);
    if (maxLabelLen === 0) {
      return { labelTop: 0, marginTop: 24 };
    }
    const maxTextWidth = maxLabelLen * 7.5;
    const upwardExtent = Math.ceil(maxTextWidth * Math.abs(Math.sin((Math.PI * 45) / 180)));
    const top = upwardExtent + 4;
    const margin = top + 24;
    return { labelTop: top, marginTop: margin };
  }, [columns, colCount]);

  const formatLabel = useCallback(
    (count: number) => {
      const word = count === 1 ? t.gitVisContribution : t.gitVisContributions;
      return `${count} ${word}`;
    },
    [t],
  );

  return (
    <div className="adl-contributor-module-heatmap">
      {allPaths && allPaths.length > 0 && (
        <ModuleBreadcrumb pathSegments={drillPath} onNavigate={handleBreadcrumbNavigate} />
      )}
      <HeatmapChart
        data={columns}
        locale={locale}
        rowLabels={rowLabels}
        margin={{ top: marginTop, right: 16, bottom: 0, left: 80 }}
        gap={2}
        binSize={36}
        layout="fluid"
        animate={true}
        fillScale={customFillScale}
        status={status}
        loadingLabel={loadingLabel}
      >
        <HeatmapCells cornerRadius={2} />
        <HeatmapXAxis
          rotateAngle={rotateAngle}
          top={labelTop}
          onColumnClick={handleColumnClick}
          onColumnContextMenu={handleColumnContextMenu}
          columnMeta={columnMeta}
        />
        <HeatmapYAxis tickFilter="all" />
        <HeatmapTooltip showDelay={150} hideDelay={100} formatLabel={formatLabel} />
      </HeatmapChart>
      {treeCard && (
        <ModuleTreeCard
          subtree={treeCard.subtree}
          position={treeCard.position}
          dir={treeCard.dir}
          onSelect={handleTreeSelect}
          onClose={() => setTreeCard(null)}
        />
      )}
    </div>
  );
});
