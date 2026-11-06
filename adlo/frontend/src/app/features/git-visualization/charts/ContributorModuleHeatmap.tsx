import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import {
  HeatmapChart,
  HeatmapCells,
  HeatmapXAxis,
  HeatmapYAxis,
  HeatmapTooltip,
} from '@/components/charts/heatmap';
import type { HeatmapColumn, HeatmapLevelResolver } from '@/components/charts/heatmap';
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
  /**
   * Controlled drill path owned by the parent. When provided the component
   * reports path changes via `onDrillPathChange`; when omitted it keeps the
   * path in internal state (uncontrolled).
   */
  drillPath?: string[];
  onDrillPathChange?: (path: string[]) => void;
  /** Dataset-aware count → level resolver shared with the card legend. */
  levelForCount?: HeatmapLevelResolver;
}

export const ContributorModuleHeatmap = React.memo(function ContributorModuleHeatmap({
  data,
  allPaths,
  status = 'ready',
  loadingLabel,
  drillPath: drillPathProp,
  onDrillPathChange,
  levelForCount,
}: ContributorModuleHeatmapProps) {
  const { t, locale } = useTCopy();
  const [internalDrillPath, setInternalDrillPath] = useState<string[]>([]);
  const drillPath = drillPathProp ?? internalDrillPath;
  const updateDrillPath = useCallback(
    (next: string[]) => {
      if (drillPathProp !== undefined) {
        onDrillPathChange?.(next);
      } else {
        setInternalDrillPath(next);
      }
    },
    [drillPathProp, onDrillPathChange],
  );
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

  // Reset a stale drill path once the underlying data no longer contains it
  // (mirrors FileHotspotsLeaderboard). With the path lifted into the parent it
  // persists across tab switches, so a refresh that removed the drilled
  // directory must fall back to root instead of rendering an empty heatmap with
  // a stale breadcrumb. HeatmapCardGroup (the state owner) mirrors this reset
  // for the case where this heatmap is unmounted while the module tab is away.
  useEffect(() => {
    if (!data || !allPaths || drillPath.length === 0 || !treeRef.current) {
      return;
    }
    if (getChildrenAtPath(treeRef.current, drillPath).length === 0) {
      updateDrillPath([]);
    }
  }, [data, allPaths, drillPath, updateDrillPath]);

  const handleColumnClick = useCallback(
    (label: string) => {
      updateDrillPath([...drillPath, label]);
    },
    [drillPath, updateDrillPath],
  );

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

  const handleBreadcrumbNavigate = useCallback(
    (level: number) => {
      if (level === -1) {
        updateDrillPath([]);
      } else {
        updateDrillPath(drillPath.slice(0, level + 1));
      }
    },
    [drillPath, updateDrillPath],
  );

  const handleTreeSelect = useCallback(
    (path: string) => {
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
      updateDrillPath(segments);
      setTreeCard(null);
    },
    [updateDrillPath],
  );

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
        levelForCount={levelForCount}
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
