import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GitVisFileHotspots } from '@/shared/ipc/workspace';
import { useTCopy } from '@i18n/useTCopy';
import { cn } from '@/lib/utils';
import { EmptyRow } from '@components/LoadingRow';
import { getHotspotChildren, type HotspotTreeNode } from '../adapters/chartDataAdapters';
import { useFileHotspotsState, type HotspotMode } from '../hooks/useFileHotspotsState';
import { ModuleBreadcrumb } from '../ModuleBreadcrumb';
import { ModuleTreeCard } from '../ModuleTreeCard';
import type { ModuleTreeNode } from '../moduleTreeUtils';

const ROW_HEIGHT = 32;
const OVERSCAN = 5;
const MAX_HEIGHT = 320;

export interface FileHotspotsLeaderboardProps {
  data?: GitVisFileHotspots;
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
}: FileHotspotsLeaderboardProps) {
  const { t } = useTCopy();
  const state = useFileHotspotsState();
  const { mode, setMode, drillPath, setDrillPath, sortKey, sortDir, setSort } = state;

  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(MAX_HEIGHT);
  const containerRef = useRef<HTMLDivElement>(null);
  const [treeCard, setTreeCard] = useState<{
    subtree: ModuleTreeNode[];
    prefix: string;
    position: { x: number; y: number };
    dirName: string;
    dirPath: string;
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

  const handleModeChange = useCallback(
    (next: HotspotMode) => {
      setMode(next);
      setScrollTop(0);
      if (next === 'full') {
        setDrillPath([]);
      }
    },
    [setMode, setDrillPath, setScrollTop],
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
        dirName: row.name,
        dirPath: row.path,
      });
    }
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
    setScrollTop(e.currentTarget.scrollTop);
    if (containerRef.current) {
      setContainerHeight(containerRef.current.clientHeight);
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

  return (
    <div className="adl-file-hotspots-ranking">
      <div className="adl-file-hotspots__toolbar">
        <div className="adl-file-hotspots__mode-toggle" role="group">
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
          <span className="adl-file-hotspots__drill-hint">{t.gitVisHotspotsDrillHint}</span>
        )}
      </div>

      {mode === 'drill' && (
        <div className="adl-file-hotspots-ranking__filter-bar">
          <ModuleBreadcrumb pathSegments={drillPath} onNavigate={handleBreadcrumbNavigate} />
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyRow message={t.gitVisHotspotsEmpty} />
      ) : (
        <div
          ref={containerRef}
          className="adl-file-hotspots-ranking__scroll"
          style={{ maxHeight: MAX_HEIGHT, overflowY: 'auto' }}
          onScroll={handleScroll}
          role="table"
        >
          <div className="adl-file-hotspots-ranking__header" role="row">
            <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--rank">
              #
            </span>
            <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--name">
              {t.gitVisHotspotsRankingName}
            </span>
            <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--path">
              {t.gitVisHotspotsRankingPath}
            </span>
            <button
              type="button"
              className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num adl-file-hotspots-ranking__sort-btn"
              onClick={() => setSort('changeCount')}
            >
              {t.gitVisHotspotsRankingChangeCount}
              {sortKey === 'changeCount' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
            </button>
            <button
              type="button"
              className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num adl-file-hotspots-ranking__sort-btn"
              onClick={() => setSort('additions')}
            >
              {t.gitVisHotspotsRankingAdditions}
              {sortKey === 'additions' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
            </button>
            <button
              type="button"
              className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num adl-file-hotspots-ranking__sort-btn"
              onClick={() => setSort('deletions')}
            >
              {t.gitVisHotspotsRankingDeletions}
              {sortKey === 'deletions' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
            </button>
            <button
              type="button"
              className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num adl-file-hotspots-ranking__sort-btn"
              onClick={() => setSort('net')}
            >
              {t.gitVisHotspotsRankingNet}
              {sortKey === 'net' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
            </button>
          </div>
          <div style={{ height: totalHeight, position: 'relative' }}>
            <div style={{ transform: `translateY(${offsetY}px)` }}>
              {visibleRows.map((row, i) => {
                const rank = startIndex + i + 1;
                return (
                  <div
                    key={row.key}
                    role="row"
                    className={cn(
                      'adl-file-hotspots-ranking__row',
                      row.isDir && 'adl-file-hotspots-ranking__row--dir',
                    )}
                    style={{ height: ROW_HEIGHT }}
                    onClick={() => handleRowClick(row)}
                    onContextMenu={(e) => handleRowContextMenu(e, row)}
                  >
                    <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--rank">
                      {rank}
                    </span>
                    <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--name">
                      {row.name}
                    </span>
                    <span
                      className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--path"
                      title={row.path}
                    >
                      {row.path}
                    </span>
                    <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num">
                      {formatNumber(row.changeCount)}
                    </span>
                    <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num adl-file-hotspots-ranking__cell--add">
                      +{formatNumber(row.additions)}
                    </span>
                    <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num adl-file-hotspots-ranking__cell--del">
                      -{formatNumber(row.deletions)}
                    </span>
                    <span
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

      {treeCard && (
        <ModuleTreeCard
          subtree={treeCard.subtree}
          position={treeCard.position}
          dirName={treeCard.dirName}
          dirPath={treeCard.dirPath}
          onSelect={handleTreeSelect}
          onClose={() => setTreeCard(null)}
        />
      )}
    </div>
  );
});
