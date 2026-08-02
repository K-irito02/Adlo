import React, { useMemo, useRef, useState } from 'react';
import type { GitVisFileHotspotFile } from '@/shared/ipc/workspace';
import type { RankingSortKey, SortDir } from '../hooks/useFileHotspotsState';
import { filterFilesByPath } from '../adapters/chartDataAdapters';
import { ModuleBreadcrumb } from '../ModuleBreadcrumb';
import { useTCopy } from '@i18n/useTCopy';
import { EmptyRow } from '@components/LoadingRow';

const ROW_HEIGHT = 32;
const OVERSCAN = 5;
const MAX_HEIGHT = 320;

export interface RankingSortState {
  sortKey: RankingSortKey;
  sortDir: SortDir;
  onSort: (key: RankingSortKey) => void;
}

export interface FileHotspotsRankingProps {
  files: GitVisFileHotspotFile[];
  filterPath: string[];
  onClearFilter: () => void;
  sortState: RankingSortState;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function getRelativePath(path: string, filterPath: string[]): string {
  if (filterPath.length === 0) {
    return path;
  }
  const prefix = `${filterPath.join('/')}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function getSortValue(file: GitVisFileHotspotFile, key: RankingSortKey): number {
  switch (key) {
    case 'changeCount':
      return file.changeCount;
    case 'additions':
      return file.additions;
    case 'deletions':
      return file.deletions;
    case 'net':
      return file.additions - file.deletions;
  }
}

export const FileHotspotsRanking = React.memo(function FileHotspotsRanking({
  files,
  filterPath,
  onClearFilter,
  sortState,
}: FileHotspotsRankingProps) {
  const { t } = useTCopy();
  const { sortKey, sortDir, onSort } = sortState;
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(MAX_HEIGHT);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => filterFilesByPath(files, filterPath), [files, filterPath]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const diff = getSortValue(a, sortKey) - getSortValue(b, sortKey);
      return sortDir === 'desc' ? -diff : diff;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const { startIndex, endIndex } = useMemo(() => {
    const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT) + OVERSCAN * 2;
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    return { startIndex: start, endIndex: Math.min(sorted.length, start + visibleCount) };
  }, [scrollTop, containerHeight, sorted.length]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
    if (containerRef.current) {
      setContainerHeight(containerRef.current.clientHeight);
    }
  };

  const handleNavigate = (level: number) => {
    // Breadcrumb navigation handled by parent via onClearFilter for simplicity
    if (level === -1) {
      onClearFilter();
    }
  };

  if (sorted.length === 0) {
    return (
      <div className="adl-file-hotspots-ranking">
        {filterPath.length > 0 && (
          <div className="adl-file-hotspots-ranking__filter-bar">
            <ModuleBreadcrumb pathSegments={filterPath} onNavigate={handleNavigate} />
            <button
              className="adl-file-hotspots-ranking__clear-btn"
              onClick={onClearFilter}
              aria-label={t.gitVisHotspotsFilterClear}
            >
              {t.gitVisHotspotsFilterClear}
            </button>
          </div>
        )}
        <EmptyRow message={t.gitVisHotspotsRankingEmpty} />
      </div>
    );
  }

  const visibleRows = sorted.slice(startIndex, endIndex);
  const totalHeight = sorted.length * ROW_HEIGHT;
  const offsetY = startIndex * ROW_HEIGHT;

  return (
    <div className="adl-file-hotspots-ranking">
      {filterPath.length > 0 && (
        <div className="adl-file-hotspots-ranking__filter-bar">
          <ModuleBreadcrumb pathSegments={filterPath} onNavigate={handleNavigate} />
          <button
            className="adl-file-hotspots-ranking__clear-btn"
            onClick={onClearFilter}
            aria-label={t.gitVisHotspotsFilterClear}
          >
            {t.gitVisHotspotsFilterClear}
          </button>
        </div>
      )}
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
          <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--file">
            {t.gitVisHotspotsRankingFile}
          </span>
          <button
            className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num adl-file-hotspots-ranking__sort-btn"
            onClick={() => onSort('changeCount')}
          >
            {t.gitVisHotspotsRankingChangeCount}
            {sortKey === 'changeCount' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
          </button>
          <button
            className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num adl-file-hotspots-ranking__sort-btn"
            onClick={() => onSort('additions')}
          >
            {t.gitVisHotspotsRankingAdditions}
            {sortKey === 'additions' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
          </button>
          <button
            className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num adl-file-hotspots-ranking__sort-btn"
            onClick={() => onSort('deletions')}
          >
            {t.gitVisHotspotsRankingDeletions}
            {sortKey === 'deletions' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
          </button>
          <button
            className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num adl-file-hotspots-ranking__sort-btn"
            onClick={() => onSort('net')}
          >
            {t.gitVisHotspotsRankingNet}
            {sortKey === 'net' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
          </button>
        </div>
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ transform: `translateY(${offsetY}px)` }}>
            {visibleRows.map((file, i) => {
              const rank = startIndex + i + 1;
              const net = file.additions - file.deletions;
              const relativePath = getRelativePath(file.path, filterPath);
              return (
                <div
                  key={file.path}
                  className="adl-file-hotspots-ranking__row"
                  role="row"
                  style={{ height: ROW_HEIGHT }}
                >
                  <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--rank">
                    {rank}
                  </span>
                  <span
                    className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--file"
                    title={file.path}
                  >
                    {relativePath}
                  </span>
                  <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num">
                    {formatNumber(file.changeCount)}
                  </span>
                  <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num adl-file-hotspots-ranking__cell--add">
                    +{formatNumber(file.additions)}
                  </span>
                  <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num adl-file-hotspots-ranking__cell--del">
                    -{formatNumber(file.deletions)}
                  </span>
                  <span
                    className={`adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num ${
                      net > 0
                        ? 'adl-file-hotspots-ranking__cell--add'
                        : net < 0
                          ? 'adl-file-hotspots-ranking__cell--del'
                          : 'adl-file-hotspots-ranking__cell--zero'
                    }`}
                  >
                    {net > 0 ? '+' : ''}
                    {formatNumber(net)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});
