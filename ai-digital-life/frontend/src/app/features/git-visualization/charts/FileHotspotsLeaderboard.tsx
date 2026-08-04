import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { GitVisFileHotspots } from '@/shared/ipc/workspace';
import type { ChartStatus } from '@/components/charts/chart-phase';
import { ChartLoadingLabel } from '@/components/charts/chart-loading-label';
import { useTCopy } from '@i18n/useTCopy';
import { cn } from '@/lib/utils';
import { CopyButton } from '@components/CopyButton';
import { IconFolder, IconHierarchy } from '@icons';
import { EmptyRow } from '@components/LoadingRow';
import { getHotspotChildren, type HotspotTreeNode } from '../adapters/chartDataAdapters';
import { useFileHotspotsState, type HotspotMode } from '../hooks/useFileHotspotsState';
import { ModuleBreadcrumb } from '../ModuleBreadcrumb';
import { ModuleTreeCard } from '../ModuleTreeCard';
import type { ModuleTreeNode } from '../moduleTreeUtils';

const ROW_HEIGHT = 32;
const OVERSCAN = 5;
const MAX_HEIGHT = 320;
const HEADER_HEIGHT = 32;
const SKELETON_ROW_COUNT = 8;

const FileHotspotsLoading = React.memo(function FileHotspotsLoading({ label }: { label?: string }) {
  return (
    <div className="adl-file-hotspots-ranking adl-git-vis__chart-loading">
      {/* Mirrors the ready toolbar with its Full / Drill mode toggle buttons. */}
      <div className="adl-file-hotspots__toolbar">
        <div className="adl-file-hotspots__mode-toggle adl-file-hotspots-ranking__skeleton-mode-toggle">
          <span className="adl-file-hotspots-ranking__skeleton-mode-btn" />
          <span className="adl-file-hotspots-ranking__skeleton-mode-btn" />
        </div>
      </div>
      <div className="adl-file-hotspots-ranking__skeleton-header">
        <span className="adl-file-hotspots-ranking__skeleton-header-cell adl-file-hotspots-ranking__skeleton-header-cell--rank" />
        <span className="adl-file-hotspots-ranking__skeleton-header-cell adl-file-hotspots-ranking__skeleton-header-cell--name" />
        <span className="adl-file-hotspots-ranking__skeleton-header-cell adl-file-hotspots-ranking__skeleton-header-cell--path" />
        <span className="adl-file-hotspots-ranking__skeleton-header-cell adl-file-hotspots-ranking__skeleton-header-cell--num" />
        <span className="adl-file-hotspots-ranking__skeleton-header-cell adl-file-hotspots-ranking__skeleton-header-cell--num" />
        <span className="adl-file-hotspots-ranking__skeleton-header-cell adl-file-hotspots-ranking__skeleton-header-cell--num" />
        <span className="adl-file-hotspots-ranking__skeleton-header-cell adl-file-hotspots-ranking__skeleton-header-cell--num" />
      </div>
      <div className="adl-file-hotspots-ranking__skeleton-body">
        {Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => (
          <div key={i} className="adl-file-hotspots-ranking__skeleton-row" style={{ height: 32 }}>
            <span className="adl-file-hotspots-ranking__skeleton-cell adl-file-hotspots-ranking__skeleton-cell--rank" />
            <span className="adl-file-hotspots-ranking__skeleton-cell adl-file-hotspots-ranking__skeleton-cell--name" />
            <span className="adl-file-hotspots-ranking__skeleton-cell adl-file-hotspots-ranking__skeleton-cell--path" />
            <span className="adl-file-hotspots-ranking__skeleton-cell adl-file-hotspots-ranking__skeleton-cell--num" />
            <span className="adl-file-hotspots-ranking__skeleton-cell adl-file-hotspots-ranking__skeleton-cell--num" />
            <span className="adl-file-hotspots-ranking__skeleton-cell adl-file-hotspots-ranking__skeleton-cell--num" />
            <span className="adl-file-hotspots-ranking__skeleton-cell adl-file-hotspots-ranking__skeleton-cell--num" />
          </div>
        ))}
      </div>
      <ChartLoadingLabel text={label} />
    </div>
  );
});

export interface FileHotspotsLeaderboardProps {
  data?: GitVisFileHotspots;
  /** Outer scroll container (e.g. the git-vis page) whose bottom is revealed when the chart grows. */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  status?: ChartStatus;
  loadingLabel?: string;
}

interface LeaderboardRow {
  key: string;
  name: string;
  path: string;
  isDir: boolean;
  changeCount: number;
  additions: number;
  deletions: number;
  net: number;
  children: HotspotTreeNode[];
}

function basename(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(idx + 1) : path;
}

function buildRowsFromFiles(files: GitVisFileHotspots['files']): LeaderboardRow[] {
  return files.map((f) => ({
    key: f.path,
    name: basename(f.path),
    path: f.path,
    isDir: false,
    changeCount: f.changeCount,
    additions: f.additions,
    deletions: f.deletions,
    net: f.additions - f.deletions,
    children: [],
  }));
}

function buildRowsFromChildren(children: HotspotTreeNode[], prefix: string): LeaderboardRow[] {
  return children.map((c) => {
    const path = prefix ? `${prefix}/${c.name}` : c.name;
    return {
      key: path,
      name: c.name,
      path,
      isDir: c.nodeType === 'directory',
      changeCount: c.changeCount ?? 0,
      additions: c.additions ?? 0,
      deletions: c.deletions ?? 0,
      net: (c.additions ?? 0) - (c.deletions ?? 0),
      children: c.children ?? [],
    };
  });
}

function hotspotChildrenToModuleTree(
  children: HotspotTreeNode[],
  prefix: string,
): ModuleTreeNode[] {
  return children.map((c) => {
    const path = prefix ? `${prefix}/${c.name}` : c.name;
    return {
      name: c.name,
      path,
      isDir: c.nodeType === 'directory',
      children: c.children ? hotspotChildrenToModuleTree(c.children, path) : [],
    };
  });
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

export const FileHotspotsLeaderboard = React.memo(function FileHotspotsLeaderboard({
  data,
  scrollContainerRef,
  status = 'ready',
  loadingLabel,
}: FileHotspotsLeaderboardProps) {
  const { t } = useTCopy();
  const state = useFileHotspotsState();
  const { mode, setMode, drillPath, setDrillPath, sortKey, sortDir, setSort } = state;

  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(MAX_HEIGHT);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollPositionsRef = useRef<{ full: number; drill: Record<string, number> }>({
    full: 0,
    drill: {},
  });
  const prevModeRef = useRef<HotspotMode>(mode);
  const prevDrillPathRef = useRef<string[]>(drillPath);
  const viewHeightRef = useRef(0);
  const prevViewHeightRef = useRef<number | null>(null);
  const [treeCard, setTreeCard] = useState<{
    subtree: ModuleTreeNode[];
    prefix: string;
    position: { x: number; y: number };
    dir: { name: string; path: string };
  } | null>(null);

  // Reset a stale drillPath when the underlying data no longer contains it.
  useEffect(() => {
    if (data && drillPath.length > 0) {
      const children = getHotspotChildren(data.tree as HotspotTreeNode, drillPath);
      if (children.length === 0) {
        setDrillPath([]);
      }
    }
  }, [data, drillPath, setDrillPath]);

  // When the chart's height grows (mode/drill/data changes), scroll the outer
  // git-visualization area to the bottom so the grown chart stays fully visible.
  // Shrink/equal heights never yank the viewport. The first call only records a
  // baseline (no jump), so a mounted chart's first growth still scrolls.
  const scrollOuterToBottom = useCallback(() => {
    const outer = scrollContainerRef?.current;
    const prev = prevViewHeightRef.current;
    if (outer && prev !== null && viewHeightRef.current > prev) {
      outer.scrollTop = outer.scrollHeight - outer.clientHeight;
    }
    prevViewHeightRef.current = viewHeightRef.current;
  }, [scrollContainerRef]);

  // Keep the container's real scroll position in sync with the virtualization
  // state. When switching modes, restore the target mode's saved scroll position
  // (per drill level); when the drill path changes within drill mode, restore
  // that level's saved position (0 on first visit). Also re-measure the
  // container height so the virtualized window matches the new row count —
  // otherwise a stale height from the previous mode leaves rows unrendered.
  useLayoutEffect(() => {
    const modeChanged = prevModeRef.current !== mode;
    const pathChanged = prevDrillPathRef.current.join('/') !== drillPath.join('/');
    prevModeRef.current = mode;
    prevDrillPathRef.current = drillPath;

    const drillKey = drillPath.join('/');
    if (modeChanged || pathChanged) {
      const target =
        mode === 'full'
          ? scrollPositionsRef.current.full
          : (scrollPositionsRef.current.drill[drillKey] ?? 0);
      if (containerRef.current) {
        containerRef.current.scrollTop = target;
        setScrollTop(containerRef.current.scrollTop);
        setContainerHeight(containerRef.current.clientHeight);
      }
      scrollOuterToBottom();
    }
  }, [mode, drillPath, scrollOuterToBottom]);

  const rows = useMemo<LeaderboardRow[]>(() => {
    if (!data) {
      return [];
    }
    if (mode === 'full') {
      return buildRowsFromFiles(data.files);
    }
    const children = getHotspotChildren(data.tree as HotspotTreeNode, drillPath);
    return buildRowsFromChildren(children, drillPath.join('/'));
  }, [data, mode, drillPath]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortDir === 'desc' ? -diff : diff;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  // Re-sync scroll/height state when the row count changes (e.g. after a data
  // refresh): the browser clamps the real scrollTop and the container height
  // follows the row count, but the state would stay stale, making the
  // virtualization window overshoot into blank rows. Also scrolls the outer
  // area to the bottom on growth (consistent with mode/drill changes).
  useLayoutEffect(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
      setContainerHeight(containerRef.current.clientHeight);
    }
    scrollOuterToBottom();
  }, [sorted.length, scrollOuterToBottom]);

  const handleModeChange = useCallback(
    (next: HotspotMode) => {
      setMode(next);
    },
    [setMode],
  );

  const handleRowClick = useCallback(
    (row: LeaderboardRow) => {
      if (row.isDir && row.children.length > 0) {
        setDrillPath([...drillPath, row.name]);
      }
    },
    [drillPath, setDrillPath],
  );

  const handleRowContextMenu = useCallback((e: React.MouseEvent, row: LeaderboardRow) => {
    if (row.isDir && row.children.length > 0) {
      e.preventDefault();
      setTreeCard({
        subtree: hotspotChildrenToModuleTree(row.children, row.path),
        prefix: row.path,
        position: { x: e.clientX, y: e.clientY },
        dir: { name: row.name, path: row.path },
      });
    }
  }, []);

  const handleJumpClick = useCallback((e: React.MouseEvent, row: LeaderboardRow) => {
    e.preventDefault();
    e.stopPropagation();
    if (row.children.length === 0) {
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTreeCard({
      subtree: hotspotChildrenToModuleTree(row.children, row.path),
      prefix: row.path,
      position: { x: rect.left, y: rect.bottom + 4 },
      dir: { name: row.name, path: row.path },
    });
  }, []);

  const handleBreadcrumbNavigate = useCallback(
    (level: number) => {
      if (level === -1) {
        setDrillPath([]);
      } else {
        setDrillPath(drillPath.slice(0, level + 1));
      }
    },
    [setDrillPath, drillPath],
  );

  const handleTreeSelect = useCallback(
    (path: string) => {
      const segments = path.split('/');
      if (treeCard) {
        const prefixSegs = treeCard.prefix ? treeCard.prefix.split('/') : [];
        const remaining = segments.slice(prefixSegs.length);
        let nodes = treeCard.subtree;
        let isFile = false;
        for (const seg of remaining) {
          const found = nodes.find((n) => n.name === seg);
          if (!found) {
            break;
          }
          isFile = !found.isDir;
          nodes = found.children;
        }
        if (isFile && segments.length > 0) {
          segments.pop();
        }
      }
      setDrillPath(segments);
      setTreeCard(null);
    },
    [treeCard, setDrillPath],
  );

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const value = e.currentTarget.scrollTop;
    setScrollTop(value);
    if (mode === 'full') {
      scrollPositionsRef.current.full = value;
    } else {
      scrollPositionsRef.current.drill[drillPath.join('/')] = value;
    }
  };

  const { startIndex, endIndex } = useMemo(() => {
    const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT) + OVERSCAN * 2;
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    return { startIndex: start, endIndex: Math.min(sorted.length, start + visibleCount) };
  }, [scrollTop, containerHeight, sorted.length]);

  const visibleRows = sorted.slice(startIndex, endIndex);
  const totalHeight = sorted.length * ROW_HEIGHT;
  const offsetY = startIndex * ROW_HEIGHT;
  const viewHeight = Math.min(MAX_HEIGHT, totalHeight + HEADER_HEIGHT);
  viewHeightRef.current = viewHeight;

  if (status === 'loading') {
    return <FileHotspotsLoading label={loadingLabel} />;
  }

  return (
    <div className="adl-file-hotspots-ranking">
      <div className="adl-file-hotspots__toolbar">
        <div
          className="adl-file-hotspots__mode-toggle"
          role="group"
          aria-label={t.gitVisHotspotsModeLabel}
        >
          <button
            type="button"
            className={cn(
              'adl-file-hotspots__mode-btn',
              mode === 'full' && 'adl-file-hotspots__mode-btn--active',
            )}
            aria-pressed={mode === 'full'}
            onClick={() => handleModeChange('full')}
          >
            {t.gitVisHotspotsModeFull}
          </button>
          <button
            type="button"
            className={cn(
              'adl-file-hotspots__mode-btn',
              mode === 'drill' && 'adl-file-hotspots__mode-btn--active',
            )}
            aria-pressed={mode === 'drill'}
            onClick={() => handleModeChange('drill')}
          >
            {t.gitVisHotspotsModeDrill}
          </button>
        </div>
        {mode === 'drill' && (
          <div className="adl-file-hotspots-ranking__filter-bar">
            <ModuleBreadcrumb pathSegments={drillPath} onNavigate={handleBreadcrumbNavigate} />
          </div>
        )}
      </div>

      {sorted.length === 0 ? (
        <EmptyRow message={t.gitVisHotspotsEmpty} />
      ) : (
        <div
          ref={containerRef}
          className="adl-file-hotspots-ranking__scroll"
          style={{ maxHeight: MAX_HEIGHT, height: viewHeight, overflowY: 'auto' }}
          onScroll={handleScroll}
          role="table"
          aria-colcount={7}
          aria-rowcount={sorted.length + 1}
        >
          <div className="adl-file-hotspots-ranking__header" role="row">
            <span
              role="columnheader"
              className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--rank"
            >
              #
            </span>
            <span
              role="columnheader"
              className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--name"
            >
              {t.gitVisHotspotsRankingName}
            </span>
            <span
              role="columnheader"
              className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--path"
            >
              {t.gitVisHotspotsRankingPath}
            </span>
            <span
              role="columnheader"
              className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num"
            >
              <button
                type="button"
                className="adl-file-hotspots-ranking__sort-btn"
                onClick={() => setSort('changeCount')}
              >
                {t.gitVisHotspotsRankingChangeCount}
                {sortKey === 'changeCount' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
              </button>
            </span>
            <span
              role="columnheader"
              className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num"
            >
              <button
                type="button"
                className="adl-file-hotspots-ranking__sort-btn"
                onClick={() => setSort('additions')}
              >
                {t.gitVisHotspotsRankingAdditions}
                {sortKey === 'additions' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
              </button>
            </span>
            <span
              role="columnheader"
              className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num"
            >
              <button
                type="button"
                className="adl-file-hotspots-ranking__sort-btn"
                onClick={() => setSort('deletions')}
              >
                {t.gitVisHotspotsRankingDeletions}
                {sortKey === 'deletions' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
              </button>
            </span>
            <span
              role="columnheader"
              className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num"
            >
              <button
                type="button"
                className="adl-file-hotspots-ranking__sort-btn"
                onClick={() => setSort('net')}
              >
                {t.gitVisHotspotsRankingNet}
                {sortKey === 'net' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
              </button>
            </span>
          </div>
          <div style={{ height: totalHeight, position: 'relative' }}>
            <div style={{ transform: `translateY(${offsetY}px)` }}>
              {visibleRows.map((row, i) => {
                const rank = startIndex + i + 1;
                return (
                  <div
                    key={row.key}
                    role="row"
                    aria-rowindex={startIndex + i + 2}
                    className={cn(
                      'adl-file-hotspots-ranking__row',
                      row.isDir && 'adl-file-hotspots-ranking__row--dir',
                    )}
                    style={{ height: ROW_HEIGHT }}
                    onClick={() => handleRowClick(row)}
                    onContextMenu={(e) => handleRowContextMenu(e, row)}
                  >
                    <span
                      role="cell"
                      className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--rank"
                    >
                      {rank}
                    </span>
                    <span
                      role="cell"
                      className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--name"
                    >
                      {row.isDir && (
                        <span className="adl-file-hotspots-ranking__dir-icon">
                          <IconFolder
                            size={14}
                            decorative
                            className="adl-file-hotspots-ranking__folder-icon"
                          />
                          <button
                            type="button"
                            className="adl-file-hotspots-ranking__jump-btn"
                            title={t.gitVisHotspotsJump}
                            aria-label={t.gitVisHotspotsJump}
                            onClick={(e) => handleJumpClick(e, row)}
                          >
                            <IconHierarchy size={12} decorative />
                          </button>
                        </span>
                      )}
                      <span className="adl-file-hotspots-ranking__cell--name-text">{row.name}</span>
                      <span className="adl-file-hotspots-ranking__copy">
                        <CopyButton
                          text={row.name}
                          size={12}
                          tooltip={t.gitVisHotspotsCopyName}
                          nativeTooltip
                        />
                      </span>
                    </span>
                    <span
                      role="cell"
                      className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--path"
                    >
                      <span className="adl-file-hotspots-ranking__cell--path-text">{row.path}</span>
                      <span className="adl-file-hotspots-ranking__copy">
                        <CopyButton
                          text={row.path}
                          size={12}
                          tooltip={t.gitVisHotspotsCopyPath}
                          nativeTooltip
                        />
                      </span>
                    </span>
                    <span
                      role="cell"
                      className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num"
                    >
                      {formatNumber(row.changeCount)}
                    </span>
                    <span
                      role="cell"
                      className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num adl-file-hotspots-ranking__cell--add"
                    >
                      +{formatNumber(row.additions)}
                    </span>
                    <span
                      role="cell"
                      className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num adl-file-hotspots-ranking__cell--del"
                    >
                      -{formatNumber(row.deletions)}
                    </span>
                    <span
                      role="cell"
                      className={`adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num ${
                        row.net > 0
                          ? 'adl-file-hotspots-ranking__cell--add'
                          : row.net < 0
                            ? 'adl-file-hotspots-ranking__cell--del'
                            : 'adl-file-hotspots-ranking__cell--zero'
                      }`}
                    >
                      {row.net > 0 ? '+' : ''}
                      {formatNumber(row.net)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <p className="adl-file-hotspots__hint">
        {mode === 'full' ? t.gitVisHotspotsFullHint : t.gitVisHotspotsDrillHint}
      </p>

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
