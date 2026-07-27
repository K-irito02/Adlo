import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { CopyButton } from '@components/CopyButton';
import { useBklitTheme } from '../hooks/useBklitTheme';
import { adaptBranchGraphData } from '../adapters/chartDataAdapters';
import { useLaneAssignment } from '../hooks/useLaneAssignment';
import type { ColumnInfo } from '../hooks/useLaneAssignment';
import type { RawBranchGraph } from '../adapters/chartDataAdapters';
import type { CommitNode, CommitEdge } from '../../../../test-fixtures/gitVisMockData';

// ── Constants ──
const LANE_WIDTH = 24;
const LANE_GAP = 8;
const ROW_HEIGHT = 36;
const NODE_RADIUS = 6;
const MERGE_NODE_SIZE = 12;
const INITIAL_LOAD = 50;
const LOAD_MORE = 30;
const GOLDEN_ANGLE = 137.508;

function getBranchColor(branch: string, isDark: boolean): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < branch.length; i++) {
    hash ^= branch.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const hue = (Math.abs(hash) * GOLDEN_ANGLE) % 360;
  const satHash = Math.imul(hash, 0x6d2b79f5) | 0;
  const satOffset = (Math.abs(satHash) % 11) - 5;
  const baseSat = isDark ? 55 : 65;
  const saturation = Math.max(45, Math.min(75, baseSat + satOffset));
  const lightHash = Math.imul(hash, 0x1b56c4e9) | 0;
  const lightOffset = (Math.abs(lightHash) % 7) - 3;
  const baseLight = isDark ? 42 : 58;
  const lightness = Math.max(35, Math.min(65, baseLight + lightOffset));
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

const AUTHOR_COLORS = [
  '#e74c3c',
  '#3498db',
  '#2ecc71',
  '#f39c12',
  '#9b59b6',
  '#1abc9c',
  '#e67e22',
  '#34495e',
];

function getAuthorColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AUTHOR_COLORS[Math.abs(hash) % AUTHOR_COLORS.length];
}

interface AuthorAvatarProps {
  name: string;
  src?: string;
  size?: number;
}

const AuthorAvatar = React.memo(function AuthorAvatar({ name, src, size = 20 }: AuthorAvatarProps) {
  const bgColor = getAuthorColor(name);
  const initial = name ? name.charAt(0).toUpperCase() : '?';

  if (src) {
    return (
      <img
        className="adl-author-avatar"
        src={src}
        alt={name}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <span
      className="adl-author-avatar"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bgColor,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.55),
        fontWeight: 600,
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {initial}
    </span>
  );
});

// ── Data preparation ──

interface RowData {
  node: CommitNode;
  column: number;
  color: string;
  parents: string[];
  isMerge: boolean;
}

function computeParentMap(edges: CommitEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const edge of edges) {
    const existing = map.get(edge.source) || [];
    existing.push(edge.target);
    map.set(edge.source, existing);
  }
  return map;
}

function getLaneX(laneIndex: number): number {
  return laneIndex * (LANE_WIDTH + LANE_GAP) + LANE_WIDTH / 2;
}

function buildRows(
  nodes: CommitNode[],
  edges: CommitEdge[],
  columnOf: Map<string, { col: number; color: string }>,
  sortedIds: string[],
): RowData[] {
  const commitById = new Map(nodes.map((n) => [n.id, n]));
  const parentMap = computeParentMap(edges);

  if (columnOf.size === 0) return [];

  return sortedIds.map((id) => {
    const node = commitById.get(id)!;
    const parents = parentMap.get(id) || [];
    const cinfo = columnOf.get(id) ?? { col: 0, color: '#888' };
    return {
      node,
      column: cinfo.col,
      color: cinfo.color,
      parents,
      isMerge: parents.length >= 2,
    };
  });
}

// ── Sub-components ──

interface SvgLanesProps {
  rows: RowData[];
  columns: ColumnInfo[];
  edges: CommitEdge[];
  totalWidth: number;
  totalHeight: number;
  hoveredId: string | null;
  nodeStroke: string;
  filterColumns: Set<number>;
  hoveredBranch: string | null;
  aheadRows: Set<number>;
}

const SvgLanes = React.memo(function SvgLanes({
  rows,
  columns,
  edges,
  totalWidth,
  totalHeight,
  hoveredId,
  nodeStroke,
  filterColumns,
  hoveredBranch,
  aheadRows,
}: SvgLanesProps) {
  const nodeY = (rowIndex: number) => rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

  const rowIndexById = new Map<string, number>();
  rows.forEach((r, i) => rowIndexById.set(r.node.id, i));

  const columnLines = columns.map((col) => {
    const x = getLaneX(col.index);
    const yPositions = rows
      .map((r, i) => (r.column === col.index ? i : -1))
      .filter((i) => i !== -1)
      .map((i) => nodeY(i));
    if (yPositions.length === 0) return null;
    const laneDimmed =
      filterColumns.size > 0 && !filterColumns.has(col.index) && col.label !== hoveredBranch;
    return (
      <line
        key={`col-${col.index}`}
        x1={x} y1={yPositions[0]} x2={x} y2={yPositions[yPositions.length - 1]}
        stroke={col.color}
        strokeWidth={3} strokeLinecap="round"
        opacity={laneDimmed ? 0.1 : 0.5}
      />
    );
  });

  const connections: React.ReactElement[] = [];
  for (const edge of edges) {
    const sourceIdx = rowIndexById.get(edge.source);
    const targetIdx = rowIndexById.get(edge.target);
    if (sourceIdx === undefined || targetIdx === undefined) {
      continue;
    }
    const sourceRow = rows[sourceIdx];
    const targetRow = rows[targetIdx];
    const sx = getLaneX(sourceRow.column);
    const sy = nodeY(sourceIdx);
    const tx = getLaneX(targetRow.column);
    const ty = nodeY(targetIdx);

    const edgeDimmed =
      filterColumns.size > 0 &&
      !filterColumns.has(sourceRow.column) &&
      !filterColumns.has(targetRow.column) &&
      sourceRow.node.branch !== hoveredBranch &&
      targetRow.node.branch !== hoveredBranch;


    if (sourceRow.column === targetRow.column) {
      connections.push(
        <line key={`edge-${edge.source}-${edge.target}`}
          x1={sx} y1={sy} x2={tx} y2={ty}
          stroke={sourceRow.color}
          strokeWidth={2.5} strokeLinecap="round"
          opacity={edgeDimmed ? 0.1 : 0.6}
        />,
      );
    } else {
      const midY = (sy + ty) / 2;
      connections.push(
        <path key={`edge-${edge.source}-${edge.target}`}
          d={`M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`}
          fill="none" stroke={sourceRow.color}
          strokeWidth={2}
          strokeDasharray={sourceIdx > targetIdx ? '4,3' : 'none'}
          opacity={edgeDimmed ? 0.1 : 0.6}
        />,
      );
    }
  }

  const nodes = rows.map((row, i) => {
    const x = getLaneX(row.column);
    const y = nodeY(i);
    const isHovered = hoveredId === row.node.id;
    const r = isHovered ? NODE_RADIUS * 1.2 : NODE_RADIUS;
    const nodeDimmed =
      filterColumns.size > 0 &&
      !filterColumns.has(row.column) &&
      row.node.branch !== hoveredBranch;
    if (row.node.tag) {
      return (
        <g key={`node-${row.node.id}`} opacity={nodeDimmed ? 0.1 : (aheadRows.has(i) ? 0.65 : 1)}>
          <circle cx={x} cy={y} r={r + 1} fill="none" stroke={row.color} strokeWidth={2.5} />
          <circle cx={x + 14} cy={y - 8} r={8} fill={row.color} opacity={0.15} />
          <text x={x + 14} y={y - 5} textAnchor="middle" fontSize={8} fill={row.color} fontWeight={600}>
            {row.node.tag}
          </text>
        </g>
      );
    }

    if (row.isMerge) {
      const s = isHovered ? MERGE_NODE_SIZE * 1.2 : MERGE_NODE_SIZE;
      return (
        <rect
          key={`node-${row.node.id}`}
          x={x - s / 2} y={y - s / 2} width={s} height={s} rx={2}
          fill={row.color}
          stroke={nodeStroke}
          strokeWidth={2}
          opacity={nodeDimmed ? 0.1 : (aheadRows.has(i) ? 0.65 : 1)}
        />
      );
    }

    return (
      <circle
        key={`node-${row.node.id}`}
        cx={x} cy={y} r={r}
        fill={row.color}
        stroke={nodeStroke}
        strokeWidth={2}
        opacity={nodeDimmed ? 0.1 : (aheadRows.has(i) ? 0.65 : 1)}
      />
    );
  });

  return (
    <svg
      className="adl-branch-graph__svg"
      width={totalWidth}
      height={totalHeight}
      viewBox={`0 0 ${totalWidth} ${totalHeight}`}
      style={{ display: 'block', pointerEvents: 'none' }}
    >

      {columnLines}
      {connections}
      {nodes}
    </svg>
  );
});

// ── Main component ──

interface BranchGraphProps {
  data?: RawBranchGraph;
}

export function BranchGraph({ data }: BranchGraphProps) {
  const { t } = useTCopy();
  const theme = useBklitTheme();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [filterColumns, setFilterColumns] = useState(() => new Set<number>());
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);

  const adapted = useMemo(() => (data ? adaptBranchGraphData(data) : null), [data]);
  const hasData = data != null;

  const tagRowRef = useRef<HTMLDivElement>(null);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(() => INITIAL_LOAD);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const handleTagRowWheel = useCallback((e: React.WheelEvent) => {
    const el = tagRowRef.current;
    if (!el) {
      return;
    }
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 0) {
      return;
    }
    const absDx = Math.abs(e.deltaX);
    const absDy = Math.abs(e.deltaY);
    el.scrollLeft += absDx > absDy ? e.deltaX : e.deltaY;
  }, []);

  useEffect(() => {
    const chart = chartContainerRef.current;
    if (!chart) {
      return;
    }
    const handler = (e: WheelEvent) => {
      const tagRow = tagRowRef.current;
      if (!tagRow || !tagRow.contains(e.target as Node)) {
        return;
      }
      e.preventDefault();
    };
    chart.addEventListener('wheel', handler, { passive: false, capture: true });
    return () => chart.removeEventListener('wheel', handler, { capture: true });
  }, []);

  const isDark = theme.background !== '#ffffff';
  const { columnOf, columns, sortedIds } = useLaneAssignment(
    adapted?.nodes ?? [],
    adapted?.edges ?? [],
    isDark,
  );

  const rows = useMemo(() => {
    if (!adapted) return [];
    // Chronological order for table: sort by commit date (newest first)
    const idDate = new Map(adapted.nodes.map(n => [n.id, n.date]));
    const chronological = [...sortedIds].sort((a, b) => {
      const da = idDate.get(a);
      const db = idDate.get(b);
      if (!da || !db) return 0;
      return db.localeCompare(da);
    });
    return buildRows(adapted.nodes, adapted.edges, columnOf, chronological);
  }, [adapted, columnOf, sortedIds]);

  useEffect(() => {
    setVisibleCount(INITIAL_LOAD);
  }, [data]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const container = chartContainerRef.current;
    if (!sentinel || !container) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + LOAD_MORE, rows.length));
        }
      },
      { root: container, rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [rows.length]);

  const columnsWithLabels = useMemo(() => {
    if (rows.length === 0 || !adapted) return columns;
    const allBr = adapted.allBranches;
    // For each column, pick the best label:
    // 1. Prefer non-origin/ branch within the column
    // 2. If only origin/ exists, try stripping prefix and matching allBranches
    const colLabel = new Map<number, string>();
    for (const row of rows) {
      if (!row.node.branch) continue;
      const prev = colLabel.get(row.column);
      if (!prev) {
        colLabel.set(row.column, row.node.branch);
      } else if (prev.startsWith('origin/') && !row.node.branch.startsWith('origin/')) {
        colLabel.set(row.column, row.node.branch);
      }
    }
    for (const [colIdx, label] of colLabel) {
      if (label.startsWith('origin/')) {
        const localName = label.slice(7);
        if (allBr.includes(localName)) {
          colLabel.set(colIdx, localName);
        }
      }
    }
    // Dedup: group columns by same label → show as one labeled entry
    const labelToCols = new Map<string, number[]>();
    for (const c of columns) {
      const lbl = colLabel.get(c.index) ?? `#${c.index}`;
      let arr = labelToCols.get(lbl);
      if (!arr) { arr = []; labelToCols.set(lbl, arr); }
      arr.push(c.index);
    }
    const freq = new Map<string, number>();
    const labeled: (ColumnInfo & { filterCols: number[] })[] = [];
    for (const c of columns) {
      const lbl = colLabel.get(c.index) ?? `#${c.index}`;
      const group = labelToCols.get(lbl)!;
      // Only add label for the first column in each group
      if (c.index !== group[0]) continue;
      const count = freq.get(lbl) || 0;
      freq.set(lbl, count + 1);
      const displayLabel = count > 0 ? `${lbl} (${count + 1})` : lbl;
      labeled.push({ ...c, label: displayLabel, filterCols: group });
    }
    const progress = adapted?.branchProgress ?? {};
    const labeledWithProgress = labeled.map(c => ({
      ...c,
      branchProgress: progress[c.label],
    }));
    return labeledWithProgress;
  }, [columns, rows, adapted]);

  const aheadRows = useMemo(() => {
    const ahead = new Set<number>();
    const progress = adapted?.branchProgress ?? {};
    for (const col of columnsWithLabels) {
      const bp = (col as any).branchProgress as ({ ahead: number; behind: number; mergeBase?: string }) | undefined;
      if (!bp?.mergeBase) continue;
      const mbRow = rows.findIndex(r => r.node.hash.startsWith(bp.mergeBase!));
      if (mbRow === -1) continue;
      const filterCols: number[] = (col as any).filterCols ?? [col.index];
      for (let i = 0; i < mbRow; i++) {
        if (filterCols.includes(rows[i].column)) {
          ahead.add(i);
        }
      }
    }
    return ahead;
  }, [columnsWithLabels, rows, adapted?.branchProgress]);

  const totalLaneWidth = columns.length * (LANE_WIDTH + LANE_GAP);
  const visibleRows = rows.slice(0, visibleCount);
  const totalHeight = visibleRows.length * ROW_HEIGHT + 8;

  const handleRowHover = useCallback((id: string | null) => setHoveredId(id), []);
  const handleLabelClick = useCallback((colIndices: number[]) => {
    setFilterColumns((prev) => {
      const next = new Set(prev);
      for (const idx of colIndices) {
        if (next.has(idx)) next.delete(idx);
        else next.add(idx);
      }
      return next;
    });
  }, []);

  const nodeStroke = isDark ? '#1a1a1a' : '#ffffff';

  if (!hasData) {
    return (
      <div className="adl-git-vis__chart" ref={chartContainerRef}>
        <p style={{ padding: 16, color: theme.muted, textAlign: 'center' }}>
          {t.gitVisBranchGraph}
        </p>
      </div>
    );
  }

  return (
    <div className="adl-git-vis__chart" ref={chartContainerRef} style={{ overflowX: 'hidden' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${totalLaneWidth + 4}px 1fr`,
          gap: 4,
        }}
      >
        <div />
        <div ref={tagRowRef} className="adl-branch-graph__tag-row" onWheel={handleTagRowWheel}>
          {columnsWithLabels.map((col) => {
            const fcs: number[] = (col as any).filterCols ?? [col.index];
            const isSelected = fcs.some(i => filterColumns.has(i));
            const isHovered = hoveredLabel === col.label;
            const showIndicator = isSelected || isHovered;
            const showScale = (isHovered && !isSelected) || (!isHovered && isSelected);
            return (
              <div
                key={`col-${col.index}`}
                className="adl-branch-graph__label-drag"
                style={{ opacity: 1 }}
              >
                <button
                  className="adl-branch-graph__label"
                  data-indicator={showIndicator ? 'true' : undefined}
                  data-scale={showScale ? 'true' : undefined}
                  onClick={() => handleLabelClick(fcs)}
                  onMouseEnter={() => setHoveredLabel(col.label)}
                  onMouseLeave={() => setHoveredLabel(null)}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 0,
                    background: col.color,
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    opacity: filterColumns.size === 0 || fcs.some(i => filterColumns.has(i)) ? 1 : 0.4,
                  }}
                >
                  <span className="adl-branch-graph__label-text" title={
                    (col as any).branchProgress
                      ? (col as any).branchProgress.mergeBase
                        ? t.gitVisProgressTooltip
                            .replace('{label}', col.label)
                            .replace('{ahead}', String((col as any).branchProgress.ahead))
                            .replace('{behind}', String((col as any).branchProgress.behind))
                          + ' | ' + t.gitVisProgressBase + ': ' + (col as any).branchProgress.mergeBase.substring(0, 7)
                        : col.label + ' — ' + t.gitVisLocalOnly
                      : col.label
                  }>
                    {col.label}
                  </span>
                  {/* Progress text — only for branches with remote tracking */}
                  {(col as any).branchProgress?.mergeBase ? (
                    <span className="adl-branch-graph__label-progress" style={{ marginLeft: 2 }}>
                      {(col as any).branchProgress.ahead > 0 && (
                        <span><span style={{ fontSize: 16, fontWeight: 700 }}>↑</span><span style={{ fontSize: 11 }}>{(col as any).branchProgress.ahead}</span></span>
                      )}
                      {(col as any).branchProgress.behind > 0 && (
                        <span><span style={{ fontSize: 16, fontWeight: 700 }}>↓</span><span style={{ fontSize: 11 }}>{(col as any).branchProgress.behind}</span></span>
                      )}
                    </span>
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>

        <div />
        <div
          className="adl-branch-graph__header"
          style={{
            display: 'grid',
            gridTemplateColumns: '80px 1fr 120px 100px',
            gap: 8,
            padding: '4px 8px',
            fontSize: 11,
            fontWeight: 600,
            color: theme.muted,
            borderBottom: `1px solid ${theme.grid}`,
          }}
        >
          <span>{t.gitVisHash}</span>
          <span>{t.gitVisMessage}</span>
          <span>{t.gitVisAuthor}</span>
          <span>{t.gitVisDate}</span>
        </div>

        <SvgLanes
          rows={visibleRows}
          columns={columnsWithLabels}
          edges={adapted?.edges ?? []}
          totalWidth={totalLaneWidth}
          totalHeight={totalHeight}
          hoveredId={hoveredId}
          nodeStroke={nodeStroke}
          filterColumns={filterColumns}
          hoveredBranch={hoveredLabel}
          aheadRows={aheadRows}
        />
        <div>
          {visibleRows.map((row) => {
            const isFiltered =
              filterColumns.size > 0 &&
              !filterColumns.has(row.column) &&
              row.node.branch !== hoveredLabel;
            return (
              <div
                key={row.node.id}
                className={`adl-branch-graph__row${hoveredId === row.node.id ? ' adl-branch-graph__row--hover' : ''}${isFiltered ? ' adl-branch-graph__row--dimmed' : ''}`}
                data-branch={row.node.branch}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '80px 1fr 120px 100px',
                  gap: 8,
                  padding: '4px 8px',
                  fontSize: 12,
                  lineHeight: ROW_HEIGHT - 8 + 'px',
                  cursor: 'default',
                  borderRadius: 4,
                  opacity: isFiltered ? 0.25 : 1,
                  minHeight: ROW_HEIGHT,
                }}
                onMouseEnter={() => handleRowHover(row.node.id)}
                onMouseLeave={() => handleRowHover(null)}
                title={`${row.node.hash}\n${row.node.message}\n${row.node.author} <${row.node.authorEmail}>\n${row.node.date}`}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono, monospace)',
                      color: theme.text,
                      fontSize: 11,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {row.node.shortHash || row.node.hash}
                  </span>
                  <span className="adl-branch-graph__copy-hash">
                    <CopyButton
                      text={row.node.hash}
                      size={11}
                      tooltip={t.gitVisCopyHash}
                      nativeTooltip
                    />
                  </span>
                </span>
                <span
                  style={{
                    color: theme.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                >
                  {row.node.message}
                  {row.node.tag && (
                    <span
                      className="adl-branch-graph__tag"
                      style={{
                        marginLeft: 8,
                        padding: '1px 4px',
                        borderRadius: 2,
                        background: row.color,
                        color: '#fff',
                        fontSize: 9,
                        fontWeight: 600,
                        lineHeight: 1,
                      }}
                    >
                      {row.node.tag}
                    </span>
                  )}
                </span>
                <span
                  style={{
                    color: theme.muted,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <AuthorAvatar name={row.node.author} />
                  {row.node.author}
                </span>
                <span style={{ color: theme.muted }}>{formatRelativeDate(row.node.date)}</span>
              </div>
            );
          })}
          {visibleCount < rows.length && (
            <div
              ref={sentinelRef}
              style={{
                textAlign: 'center',
                padding: '8px 0',
                fontSize: 11,
                color: theme.muted,
              }}
            >
              {t.gitVisLoadingMore}
            </div>
          )}
          {visibleCount >= rows.length && rows.length > INITIAL_LOAD && (
            <div
              style={{
                textAlign: 'center',
                padding: '8px 0',
                fontSize: 11,
                color: theme.muted,
              }}
            >
              {t.gitVisAllLoaded?.replace('{count}', String(rows.length))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

function formatRelativeDate(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    return '0d';
  }
  const diffMs = Math.max(0, now.getTime() - d.getTime());
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 1) {
    return '0d';
  }
  if (diffDays < 30) {
    return `${diffDays}d`;
  }
  if (diffDays < 365) {
    return `${Math.floor(diffDays / 30)}mo`;
  }
  return `${Math.floor(diffDays / 365)}y`;
}
