import React, { useMemo, useState, useCallback, useRef, useEffect, useDeferredValue } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { CopyButton } from '@components/CopyButton';
import { TooltipSimple } from '@components/Tooltip';
import { useBklitTheme } from '../hooks/useBklitTheme';
import { adaptBranchGraphData } from '../adapters/chartDataAdapters';
import { useLaneAssignment } from '../hooks/useLaneAssignment';
import { useMouseDragReorder } from '../hooks/useMouseDragReorder';
import { formatDate, generatePixelAvatar } from '../utils/commitTooltipUtils';
import { getAvatar, getCachedAvatarUrl } from '../utils/avatarCache';
import { IconFileText } from '@icons/status';
import type { ColumnInfo } from '../hooks/useLaneAssignment';
import type { RawBranchGraph } from '../adapters/chartDataAdapters';
import type { CommitNode, CommitEdge } from '../types/gitGraph';

// ── Constants ──
const emptyArr: never[] = [];
const LANE_WIDTH = 24;
const LANE_GAP = 8;
const ROW_HEIGHT = 36;
const NODE_RADIUS = 6;
const MERGE_NODE_SIZE = 12;
const INITIAL_LOAD = 50;
const LOAD_MORE = 30;

function getRefLabelColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 45%, 55%)`;
}

interface AuthorAvatarProps {
  name: string;
  email?: string;
  size?: number;
}

const AuthorAvatar = React.memo(function AuthorAvatar({
  name,
  email,
  size = 20,
}: AuthorAvatarProps) {
  // Pixel avatar is local (no network), shown instantly as the initial src.
  // Real avatar is loaded asynchronously via avatarCache (L1 memory → L2 IDB → network).
  // On cache hit, replaces the pixel avatar. On miss/failure, keeps pixel avatar.
  const pixelAvatar = useMemo(() => generatePixelAvatar(email ?? '', size), [email, size]);
  // Sync L1 lookup: if a cached Blob URL already exists (e.g. previous row fetched it),
  // use it as the initial src to avoid the pixel-avatar flicker during fast scroll.
  const [src, setSrc] = useState<string>(() => getCachedAvatarUrl(email ?? '') ?? pixelAvatar);

  useEffect(() => {
    if (!email) {
      setSrc(pixelAvatar);
      return;
    }
    // If L1 cache already has the avatar, skip the pixel-avatar reset to avoid flicker
    const cached = getCachedAvatarUrl(email);
    if (cached) {
      setSrc(cached);
      return;
    }
    // Cache miss — show pixel avatar while fetching
    setSrc(pixelAvatar);
    let cancelled = false;
    getAvatar(email, size).then((cachedUrl) => {
      if (!cancelled && cachedUrl) {
        setSrc(cachedUrl);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [email, size, pixelAvatar]);

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
});

// ── Commit Tooltip Card ──

interface CommitTooltipCardProps {
  hash: string;
  message: string;
  author: string;
  authorEmail: string;
  date: string;
}

const CommitTooltipCard = React.memo(function CommitTooltipCard({
  hash,
  message,
  author,
  authorEmail,
  date,
}: CommitTooltipCardProps) {
  const { t } = useTCopy();
  const locale = navigator.language || 'en-US';

  return (
    <div className="adl-branch-graph__tooltip-card">
      <div className="adl-branch-graph__tooltip-hash">
        {hash}
        <span className="adl-branch-graph__copy-hash">
          <CopyButton text={hash} size={11} tooltip={t.gitVisCopyHash} nativeTooltip />
        </span>
      </div>

      <hr className="adl-branch-graph__tooltip-divider" />

      <div
        className="adl-branch-graph__tooltip-message"
        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
      >
        {message}
      </div>

      <hr className="adl-branch-graph__tooltip-divider" />

      <div className="adl-branch-graph__tooltip-author">
        <AuthorAvatar name={author} email={authorEmail} size={32} />
        <div className="adl-branch-graph__tooltip-author-info">
          <span className="adl-branch-graph__tooltip-author-name">{author}</span>
          <span className="adl-branch-graph__tooltip-author-email">{authorEmail}</span>
        </div>
      </div>

      <hr className="adl-branch-graph__tooltip-divider" />

      <div className="adl-branch-graph__tooltip-date">{formatDate(date, locale, 'tooltip')}</div>
    </div>
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

interface RefLabelInfo {
  name: string;
  cols: number[];
}

interface LabelColumnInfo extends ColumnInfo {
  filterCols: number[];
  branchProgress?: { ahead: number; behind: number; mergeBase?: string };
  refsLabels?: RefLabelInfo[];
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

  if (columnOf.size === 0) {
    return [];
  }

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
  columnOrder: number[];
  edges: CommitEdge[];
  totalWidth: number;
  totalHeight: number;
  nodeStroke: string;
  filterColumns: Set<number>;
  hoveredBranch: string | null;
  hoveredRowId: string | null;
  aheadRows: Set<number>;
  activeRefLabel: string | null;
}

const SvgLanes = React.memo(
  function SvgLanes({
    rows,
    columns,
    columnOrder,
    edges,
    totalWidth,
    totalHeight,
    nodeStroke,
    filterColumns,
    hoveredBranch,
    hoveredRowId,
    aheadRows,
    activeRefLabel,
  }: SvgLanesProps) {
    const nodeY = (rowIndex: number) => rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
    const visualIndex = (colIdx: number) => {
      const idx = columnOrder.indexOf(colIdx);
      return idx >= 0 ? idx : colIdx;
    };

    const refLabelColor = activeRefLabel ? getRefLabelColor(activeRefLabel) : null;
    const rowHasRef = (row: RowData) => activeRefLabel && row.node.refs?.includes(activeRefLabel);
    const rowDimmedByRef = (row: RowData) => !!activeRefLabel && !rowHasRef(row);
    const rowIndexById = useMemo(() => {
      const map = new Map<string, number>();
      rows.forEach((r, i) => map.set(r.node.id, i));
      return map;
    }, [rows]);

    const columnLines = useMemo(() => {
      const els: React.ReactElement[] = [];
      for (const col of columns) {
        const x = getLaneX(visualIndex(col.index));
        const laneByCol =
          filterColumns.size > 0 && !filterColumns.has(col.index) && col.label !== hoveredBranch;
        const laneByRef =
          !!activeRefLabel && !rows.some((r) => r.column === col.index && rowHasRef(r));
        const laneDimmed =
          filterColumns.size > 0 && !!activeRefLabel
            ? laneByCol && laneByRef
            : laneByCol || laneByRef;
        const yPositions = rows
          .map((r, i) => (r.column === col.index ? i : -1))
          .filter((i) => i !== -1)
          .map((i) => nodeY(i));
        if (yPositions.length === 0) {
          continue;
        }
        const y1 = yPositions[0];
        const y2 = yPositions[yPositions.length - 1];
        els.push(
          <line
            key={`col-${col.index}`}
            x1={x}
            y1={y1}
            x2={x}
            y2={y2}
            stroke={col.color}
            strokeWidth={3}
            strokeLinecap="round"
            opacity={laneDimmed ? 0.1 : 0.5}
          />,
        );
      }
      return els;
    }, [columns, filterColumns, hoveredBranch, activeRefLabel, rows, columnOrder]);

    const connections = useMemo(() => {
      const result: React.ReactElement[] = [];
      for (const edge of edges) {
        const sourceIdx = rowIndexById.get(edge.source);
        const targetIdx = rowIndexById.get(edge.target);
        if (sourceIdx === undefined || targetIdx === undefined) {
          continue;
        }
        const sourceRow = rows[sourceIdx];
        const targetRow = rows[targetIdx];
        const sx = getLaneX(visualIndex(sourceRow.column));
        const sy = nodeY(sourceIdx);
        const tx = getLaneX(visualIndex(targetRow.column));
        const ty = nodeY(targetIdx);

        const edgeByCol =
          filterColumns.size > 0 &&
          !filterColumns.has(sourceRow.column) &&
          !filterColumns.has(targetRow.column) &&
          sourceRow.node.branch !== hoveredBranch &&
          targetRow.node.branch !== hoveredBranch;
        const edgeByRef = rowDimmedByRef(sourceRow) && rowDimmedByRef(targetRow);
        const edgeDimmed =
          filterColumns.size > 0 && !!activeRefLabel
            ? edgeByCol && edgeByRef
            : edgeByCol || edgeByRef;

        if (sourceRow.column === targetRow.column) {
          result.push(
            <line
              key={`edge-${edge.source}-${edge.target}`}
              x1={sx}
              y1={sy}
              x2={tx}
              y2={ty}
              stroke={sourceRow.color}
              strokeWidth={2.5}
              strokeLinecap="round"
              opacity={edgeDimmed ? 0.1 : 0.6}
            />,
          );
        } else {
          const midY = (sy + ty) / 2;
          result.push(
            <path
              key={`edge-${edge.source}-${edge.target}`}
              d={`M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`}
              fill="none"
              stroke={sourceRow.color}
              strokeWidth={2}
              strokeDasharray={sourceIdx > targetIdx ? '4,3' : 'none'}
              opacity={edgeDimmed ? 0.1 : 0.6}
            />,
          );
        }
      }
      return result;
    }, [
      edges,
      rowIndexById,
      rows,
      filterColumns,
      hoveredBranch,
      activeRefLabel,
      refLabelColor,
      columnOrder,
    ]);

    const nodes = useMemo(
      () =>
        rows.map((row, i) => {
          const x = getLaneX(visualIndex(row.column));
          const y = nodeY(i);
          const isHovered = row.node.id === hoveredRowId;
          const r = isHovered ? NODE_RADIUS + 2 : NODE_RADIUS;
          const byCol =
            filterColumns.size > 0 &&
            !filterColumns.has(row.column) &&
            row.node.branch !== hoveredBranch;
          const byRef = rowDimmedByRef(row);
          const nodeDimmed =
            filterColumns.size > 0 && !!activeRefLabel ? byCol && byRef : byCol || byRef;
          const nodeFill =
            !nodeDimmed && rowHasRef(row) && refLabelColor ? refLabelColor : row.color;
          if (row.node.tag) {
            return (
              <g
                key={`node-${row.node.id}`}
                opacity={nodeDimmed ? 0.1 : aheadRows.has(i) ? 0.65 : 1}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? r + 2 : r + 1}
                  fill="none"
                  stroke={nodeFill}
                  strokeWidth={isHovered ? 3.5 : 2.5}
                />
                <circle cx={x + 14} cy={y - 8} r={8} fill={nodeFill} opacity={0.15} />
                <text
                  x={x + 14}
                  y={y - 5}
                  textAnchor="middle"
                  fontSize={8}
                  fill={nodeFill}
                  fontWeight={600}
                >
                  {row.node.tag}
                </text>
              </g>
            );
          }

          if (row.isMerge) {
            const s = isHovered ? MERGE_NODE_SIZE + 4 : MERGE_NODE_SIZE;
            return (
              <rect
                key={`node-${row.node.id}`}
                x={x - s / 2}
                y={y - s / 2}
                width={s}
                height={s}
                rx={2}
                fill={nodeFill}
                stroke={nodeStroke}
                strokeWidth={isHovered ? 3 : 2}
                opacity={nodeDimmed ? 0.1 : aheadRows.has(i) ? 0.65 : 1}
              />
            );
          }

          return (
            <circle
              key={`node-${row.node.id}`}
              cx={x}
              cy={y}
              r={r}
              fill={nodeFill}
              stroke={nodeStroke}
              strokeWidth={isHovered ? 3 : 2}
              opacity={nodeDimmed ? 0.1 : aheadRows.has(i) ? 0.65 : 1}
            />
          );
        }),
      [
        rows,
        filterColumns,
        hoveredBranch,
        hoveredRowId,
        activeRefLabel,
        refLabelColor,
        nodeStroke,
        aheadRows,
        columnOrder,
      ],
    );

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
  },
  (prev, next) =>
    prev.rows === next.rows &&
    prev.columns === next.columns &&
    prev.columnOrder === next.columnOrder &&
    prev.edges === next.edges &&
    prev.totalWidth === next.totalWidth &&
    prev.totalHeight === next.totalHeight &&
    prev.nodeStroke === next.nodeStroke &&
    prev.filterColumns === next.filterColumns &&
    prev.hoveredBranch === next.hoveredBranch &&
    prev.hoveredRowId === next.hoveredRowId &&
    prev.aheadRows === next.aheadRows &&
    prev.activeRefLabel === next.activeRefLabel,
);

// ── Extracted Commit Table Rows (memo'd to prevent re-render on hoveredId change) ──

interface CommitTableRowsProps {
  visibleRows: RowData[];
  filterColumns: Set<number>;
  activeRefLabel: string | null;
  hoveredLabel: string | null;
  onRowHover: (id: string | null) => void;
  theme: ReturnType<typeof useBklitTheme>;
  t: ReturnType<typeof useTCopy>['t'];
  locale: string;
}

const CommitTableRows = React.memo(
  function CommitTableRows({
    visibleRows,
    filterColumns,
    activeRefLabel,
    hoveredLabel,
    onRowHover,
    theme,
    t,
    locale,
  }: CommitTableRowsProps) {
    return (
      <div className="adl-branch-graph__table-panel">
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
        {visibleRows.map((row) => {
          const byCol =
            filterColumns.size > 0 &&
            !filterColumns.has(row.column) &&
            row.node.branch !== hoveredLabel;
          const byRef = !!activeRefLabel && !row.node.refs?.includes(activeRefLabel);
          const isFiltered =
            filterColumns.size > 0 && !!activeRefLabel ? byCol && byRef : byCol || byRef;
          const additionalRefs =
            row.node.refs?.filter(
              (ref) =>
                ref !== row.node.branch &&
                !ref.startsWith('origin/') &&
                !ref.startsWith('upstream/'),
            ) ?? [];
          return (
            <div
              key={row.node.id}
              className={`adl-branch-graph__row${isFiltered ? ' adl-branch-graph__row--dimmed' : ''}`}
              data-branch={row.node.branch}
              onMouseEnter={() => onRowHover(row.node.id)}
              onMouseLeave={() => onRowHover(null)}
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
                {additionalRefs.length > 0 && (
                  <span
                    style={{
                      display: 'inline-flex',
                      gap: 2,
                      marginLeft: 4,
                      verticalAlign: 'middle',
                      flexShrink: 0,
                    }}
                  >
                    {additionalRefs.slice(0, 3).map((ref) => (
                      <span key={ref} className="adl-branch-graph__commit-badge">
                        {ref}
                      </span>
                    ))}
                    {additionalRefs.length > 3 && (
                      <span className="adl-branch-graph__commit-badge">
                        +{additionalRefs.length - 3}
                      </span>
                    )}
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
                <AuthorAvatar name={row.node.author} email={row.node.authorEmail} />
                {row.node.author}
                <TooltipSimple
                  content={
                    <CommitTooltipCard
                      hash={row.node.hash}
                      message={row.node.message}
                      author={row.node.author}
                      authorEmail={row.node.authorEmail}
                      date={row.node.date}
                    />
                  }
                  placement="right"
                  showArrow
                  maxWidth={400}
                  className="adl-hint-card"
                >
                  <button
                    type="button"
                    className="adl-branch-graph__info-btn"
                    tabIndex={-1}
                    aria-label=""
                  >
                    <IconFileText size={14} />
                  </button>
                </TooltipSimple>
              </span>
              <span style={{ color: theme.muted }}>
                {formatDate(row.node.date, locale, 'table')}
              </span>
            </div>
          );
        })}
      </div>
    );
  },
  (prev, next) =>
    prev.visibleRows === next.visibleRows &&
    prev.filterColumns === next.filterColumns &&
    prev.activeRefLabel === next.activeRefLabel &&
    prev.hoveredLabel === next.hoveredLabel &&
    prev.onRowHover === next.onRowHover &&
    prev.theme === next.theme &&
    prev.t === next.t &&
    prev.locale === next.locale,
);

// ── Extracted Tag Row (memo'd to prevent re-render of table/SVG during drag) ──

interface TagRowProps {
  tagRowOrder: string[];
  columnsWithLabels: LabelColumnInfo[];
  filterColumns: Set<number>;
  draggedId: string | null;
  overId: string | null;
  isDark: boolean;
  handleMouseDown: (id: string) => (e: React.MouseEvent) => void;
  handleLabelClick: (colIndices: number[]) => void;
  selectedLabels: Set<string>;
  setSelectedLabels: React.Dispatch<React.SetStateAction<Set<string>>>;
  t: ReturnType<typeof useTCopy>['t'];
}

const TagRow = React.memo(function TagRow({
  tagRowOrder,
  columnsWithLabels,
  filterColumns,
  draggedId,
  overId,
  isDark,
  handleMouseDown,
  handleLabelClick,
  selectedLabels,
  setSelectedLabels,
  t,
}: TagRowProps) {
  const tagRowRef = useRef<HTMLDivElement>(null);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const handleTagRowWheelInner = useCallback((e: React.WheelEvent) => {
    const el = tagRowRef.current;
    if (!el) {
      return;
    }
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 0) {
      return;
    }
    e.preventDefault();
    const absDx = Math.abs(e.deltaX);
    const absDy = Math.abs(e.deltaY);
    el.scrollLeft += absDx > absDy ? e.deltaX : e.deltaY;
  }, []);

  return (
    <div
      ref={tagRowRef}
      className="adl-branch-graph__tag-row--sticky"
      onWheel={handleTagRowWheelInner}
    >
      {tagRowOrder.map((itemId) => {
        if (itemId.startsWith('col-')) {
          const colIndex = Number(itemId.slice(4));
          const col = columnsWithLabels.find((c) => c.index === colIndex);
          if (!col) {
            return null;
          }
          const fcs: number[] = col.filterCols ?? [col.index];
          const isSelected = fcs.some((i) => filterColumns.has(i));
          const isHovered = hoveredLabel === col.label;
          const showIndicator = isSelected || isHovered;
          const showScale = (isHovered && !isSelected) || (!isHovered && isSelected);
          return (
            <React.Fragment key={itemId}>
              <div
                className="adl-branch-graph__label-drag"
                data-drag-id={itemId}
                onMouseDown={handleMouseDown(itemId)}
                style={{
                  opacity: draggedId === itemId ? 0.4 : 1,
                  borderLeft:
                    overId === itemId && draggedId !== itemId
                      ? isDark
                        ? '2px solid #fff'
                        : '2px solid #000'
                      : undefined,
                  borderRight:
                    overId === itemId && draggedId !== itemId
                      ? isDark
                        ? '2px solid #fff'
                        : '2px solid #000'
                      : undefined,
                  boxShadow:
                    overId === itemId && draggedId !== itemId
                      ? isDark
                        ? '0 0 4px #fff'
                        : '0 0 4px #000'
                      : undefined,
                  transition: 'opacity 0.1s',
                }}
              >
                <button
                  className="adl-branch-graph__label"
                  data-indicator={showIndicator ? 'true' : undefined}
                  data-scale={showScale ? 'true' : undefined}
                  onClick={() => handleLabelClick(fcs)}
                  onMouseEnter={() => !draggedId && setHoveredLabel(col.label ?? null)}
                  onMouseLeave={() => !draggedId && setHoveredLabel(null)}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 0,
                    background: col.color,
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    lineHeight: 1,
                    opacity:
                      selectedLabels.size === 0 || fcs.some((i) => selectedLabels.has(`col-${i}`))
                        ? 1
                        : 0.4,
                  }}
                >
                  <span
                    className="adl-branch-graph__label-text"
                    title={
                      col.branchProgress
                        ? col.branchProgress.mergeBase
                          ? t.gitVisProgressTooltip
                              .replace('{label}', col.label ?? '')
                              .replace('{ahead}', String(col.branchProgress.ahead))
                              .replace('{behind}', String(col.branchProgress.behind)) +
                            ' | ' +
                            t.gitVisProgressBase +
                            ': ' +
                            col.branchProgress.mergeBase.substring(0, 7)
                          : (col.label ?? '') + ' — ' + t.gitVisLocalOnly
                        : (col.label ?? '')
                    }
                  >
                    {col.label ?? ''}
                  </span>
                  {col.branchProgress?.mergeBase ? (
                    <span className="adl-branch-graph__label-progress" style={{ marginLeft: 2 }}>
                      {col.branchProgress.ahead > 0 && (
                        <span>
                          <span style={{ fontSize: 16, fontWeight: 700 }}>↑</span>
                          <span style={{ fontSize: 11 }}>{col.branchProgress.ahead}</span>
                        </span>
                      )}
                      {col.branchProgress.behind > 0 && (
                        <span>
                          <span style={{ fontSize: 16, fontWeight: 700 }}>↓</span>
                          <span style={{ fontSize: 11 }}>{col.branchProgress.behind}</span>
                        </span>
                      )}
                    </span>
                  ) : null}
                </button>
              </div>
            </React.Fragment>
          );
        } else if (itemId.startsWith('ref:')) {
          const refName = itemId.slice(4);
          const bgColor = getRefLabelColor(refName);
          const isActive = selectedLabels.has(itemId);
          const showIndicator = hoveredLabel === refName || isActive;
          const showScale = (hoveredLabel === refName) !== isActive;
          return (
            <div
              key={itemId}
              className="adl-branch-graph__label-drag"
              data-drag-id={itemId}
              onMouseDown={handleMouseDown(itemId)}
              style={{
                opacity:
                  draggedId === itemId
                    ? 0.4
                    : selectedLabels.size === 0 || selectedLabels.has(itemId)
                      ? 1
                      : 0.4,
                borderLeft:
                  overId === itemId && draggedId !== itemId
                    ? isDark
                      ? '2px solid #fff'
                      : '2px solid #000'
                    : undefined,
                borderRight:
                  overId === itemId && draggedId !== itemId
                    ? isDark
                      ? '2px solid #fff'
                      : '2px solid #000'
                    : undefined,
                boxShadow:
                  overId === itemId && draggedId !== itemId
                    ? isDark
                      ? '0 0 4px #fff'
                      : '0 0 4px #000'
                    : undefined,
                transition: 'opacity 0.1s',
              }}
            >
              <button
                className="adl-branch-graph__label"
                data-indicator={showIndicator ? 'true' : undefined}
                data-scale={showScale ? 'true' : undefined}
                onClick={() =>
                  setSelectedLabels((prev) => {
                    const id = `ref:${refName}`;
                    if (prev.has(id)) {
                      const next = new Set(prev);
                      next.delete(id);
                      return next;
                    }
                    const next = new Set(prev);
                    for (const key of next) {
                      if (key.startsWith('ref:')) {
                        next.delete(key);
                      }
                    }
                    next.add(id);
                    return next;
                  })
                }
                onMouseEnter={() => !draggedId && setHoveredLabel(refName)}
                onMouseLeave={() => !draggedId && setHoveredLabel(null)}
                style={{
                  padding: '2px 8px',
                  borderRadius: 0,
                  background: bgColor,
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  lineHeight: 1,
                  opacity: 1,
                }}
                title={t.gitVisLocalOnly ? refName + ' — ' + t.gitVisLocalOnly : refName}
              >
                {refName}
              </button>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
});

// ── Main component ──

interface BranchGraphProps {
  data?: RawBranchGraph;
}

export function BranchGraph({ data }: BranchGraphProps) {
  // Design spec for tag hover effects (Issue 1) and head annotation (Issue 2):
  // docs/superpowers/specs/2026-07-29-branch-graph-tag-hover-and-head-annotation-design.md
  const { t } = useTCopy();
  const locale = navigator.language || 'en-US';
  const theme = useBklitTheme();

  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set());
  const deferredSelectedLabels = useDeferredValue(selectedLabels);
  // Derive internal filter states from unified selectedLabels (immediate for TagRow)
  const filterColumns = useMemo(() => {
    const cols = new Set<number>();
    for (const id of selectedLabels) {
      if (id.startsWith('col-')) {
        cols.add(Number(id.slice(4)));
      }
    }
    return cols;
  }, [selectedLabels]);
  const activeRefLabel = [...selectedLabels].find((id) => id.startsWith('ref:'))?.slice(4) ?? null;
  // Deferred versions for CommitTableRows/SvgLanes (avoids blocking label feedback)
  const deferredFilterColumns = useMemo(() => {
    const cols = new Set<number>();
    for (const id of deferredSelectedLabels) {
      if (id.startsWith('col-')) {
        cols.add(Number(id.slice(4)));
      }
    }
    return cols;
  }, [deferredSelectedLabels]);
  const deferredActiveRefLabel =
    [...deferredSelectedLabels].find((id) => id.startsWith('ref:'))?.slice(4) ?? null;

  const adapted = useMemo(() => (data ? adaptBranchGraphData(data) : null), [data]);
  // Preload avatar images so tooltip card shows them instantly
  useEffect(() => {
    if (!adapted?.nodes) {
      return;
    }
    const seen = new Set<string>();
    for (const node of adapted.nodes) {
      if (!node.authorEmail || seen.has(node.authorEmail)) {
        continue;
      }
      seen.add(node.authorEmail);
      getAvatar(node.authorEmail, 32).catch(() => {
        // Network failures are expected; pixel avatar remains as fallback
      });
    }
  }, [adapted]);
  const hasData = data != null;

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(() => INITIAL_LOAD);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const isDark = theme.background !== '#ffffff';
  // Stabilize empty array inputs to prevent cascading re-renders via useLaneAssignment
  const laneInputs = useMemo(
    () => (adapted ? { nodes: adapted.nodes, edges: adapted.edges } : null),
    [adapted],
  );
  const { columnOf, columns, sortedIds } = useLaneAssignment(
    laneInputs?.nodes ?? emptyArr,
    laneInputs?.edges ?? emptyArr,
    isDark,
  );

  const allColIndices = useMemo(() => columns.map((c) => c.index), [columns]);

  // ── Flat tag row order (columns + ref labels interspersed) ──
  // Stored as state so drag positions are preserved; ref labels independent of parent column.
  const buildTagOrder = useCallback(
    (colOrder: number[], colsWithLabels: LabelColumnInfo[]): string[] => {
      const order: string[] = [];
      for (const ci of colOrder) {
        const col = colsWithLabels.find((c) => c.index === ci);
        if (!col) {
          continue;
        }
        order.push(`col-${ci}`);
        if (col.refsLabels) {
          for (const rl of col.refsLabels) {
            order.push(`ref:${rl.name}`);
          }
        }
      }
      return order;
    },
    [],
  );
  const [tagRowOrder, setTagRowOrder] = useState<string[]>([]);
  // Derive column visual order from drag-adjusted tag row order
  const columnOrder = useMemo(
    () => tagRowOrder.filter((id) => id.startsWith('col-')).map((id) => Number(id.slice(4))),
    [tagRowOrder],
  );
  // ── Drag-and-drop for tag row labels (simple, matches workspace tab pattern) ──
  const { draggedId, overId, handleMouseDown } = useMouseDragReorder(tagRowOrder, setTagRowOrder);

  // Branch head detection: first occurrence of each branch in topological order = HEAD
  const rows = useMemo(() => {
    if (!adapted) {
      return [];
    }
    // Chronological order for table: sort by commit date (newest first)
    const idDate = new Map(adapted.nodes.map((n) => [n.id, n.date]));
    const chronological = [...sortedIds].sort((a, b) => {
      const da = idDate.get(a);
      const db = idDate.get(b);
      if (!da || !db) {
        return 0;
      }
      return db.localeCompare(da);
    });
    return buildRows(adapted.nodes, adapted.edges, columnOf, chronological);
  }, [adapted, columnOf, sortedIds]);

  useEffect(() => {
    setVisibleCount(INITIAL_LOAD);
  }, [data]);

  useEffect(() => {
    if (visibleCount >= rows.length) {
      return;
    }
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
  }, [visibleCount, rows.length]);

  const columnsWithLabels = useMemo((): LabelColumnInfo[] => {
    if (rows.length === 0 || !adapted) {
      return columns as LabelColumnInfo[];
    }
    const allBr = adapted.allBranches;
    // For each column, pick the best label:
    // 1. Prefer non-origin/ branch within the column
    // 2. If only origin/ exists, try stripping prefix and matching allBranches
    const colLabel = new Map<number, string>();
    for (const row of rows) {
      let label = row.node.branch;
      if (!label && row.node.refs) {
        const refLabel = row.node.refs.find(
          (r) => !r.startsWith('origin/') && !r.startsWith('upstream/') && allBr.includes(r),
        );
        if (refLabel) {
          label = refLabel;
        }
      }
      if (!label) {
        continue;
      }
      const prev = colLabel.get(row.column);
      if (!prev) {
        colLabel.set(row.column, label);
      } else if (prev.startsWith('origin/') && !label.startsWith('origin/')) {
        colLabel.set(row.column, label);
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
      if (!colLabel.has(c.index)) {
        continue;
      }
      const lbl = colLabel.get(c.index)!;
      let arr = labelToCols.get(lbl);
      if (!arr) {
        arr = [];
        labelToCols.set(lbl, arr);
      }
      arr.push(c.index);
    }
    const freq = new Map<string, number>();
    const labeled: LabelColumnInfo[] = [];
    for (const c of columns) {
      if (!colLabel.has(c.index)) {
        continue;
      }
      const lbl = colLabel.get(c.index)!;
      const group = labelToCols.get(lbl)!;
      // Only add label for the first column in each group
      if (c.index !== group[0]) {
        continue;
      }
      const count = freq.get(lbl) || 0;
      freq.set(lbl, count + 1);
      const displayLabel = count > 0 ? `${lbl} (${count + 1})` : lbl;
      labeled.push({ ...c, label: displayLabel, filterCols: group });
    }
    // Phase 3: build per-label column mapping from refs
    const refLabelCols = new Map<string, number[]>();
    for (const row of rows) {
      if (!row.node.refs) {
        continue;
      }
      for (const ref of row.node.refs) {
        if (ref.startsWith('origin/') || ref.startsWith('upstream/')) {
          continue;
        }
        if (ref === colLabel.get(row.column)) {
          continue;
        }
        if (!allBr.includes(ref)) {
          continue;
        }
        let cols = refLabelCols.get(ref);
        if (!cols) {
          cols = [];
          refLabelCols.set(ref, cols);
        }
        if (!cols.includes(row.column)) {
          cols.push(row.column);
        }
      }
    }

    const progress = adapted?.branchProgress ?? {};
    const labeledWithProgress = labeled.map((c) => {
      // Collect refsLabels that belong to columns in this group
      const seen = new Set<string>();
      const refsLabels: RefLabelInfo[] = [];
      for (const colIdx of c.filterCols) {
        for (const [ref, cols] of refLabelCols) {
          if (cols.includes(colIdx) && !seen.has(ref)) {
            seen.add(ref);
            refsLabels.push({ name: ref, cols: [...cols] });
          }
        }
      }
      return {
        ...c,
        branchProgress: progress[c.label ?? ''],
        refsLabels: refsLabels.length > 0 ? refsLabels : undefined,
      };
    });
    return labeledWithProgress;
  }, [columns, rows, adapted]);

  // Merge new items when data loads, preserving drag-adjusted positions
  const prevMergeKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const fresh = buildTagOrder(allColIndices, columnsWithLabels);
    const freshKey = fresh.join(',');
    if (freshKey === prevMergeKeyRef.current) {
      return;
    }
    prevMergeKeyRef.current = freshKey;
    setTagRowOrder((prev) => {
      if (prev.length === 0) {
        return fresh;
      }
      if (fresh.length === 0) {
        return prev;
      }
      const merged = prev.filter((id) => fresh.includes(id));
      for (const id of fresh) {
        if (!merged.includes(id)) {
          merged.push(id);
        }
      }
      return merged;
    });
  }, [columnsWithLabels, allColIndices]);

  const aheadRows = useMemo(() => {
    const ahead = new Set<number>();
    for (const col of columnsWithLabels) {
      const bp = col.branchProgress;
      if (!bp?.mergeBase) {
        continue;
      }
      const mbRow = rows.findIndex((r) => r.node.hash === bp.mergeBase);
      if (mbRow === -1) {
        continue;
      }
      for (let i = 0; i < mbRow; i++) {
        if (col.filterCols.includes(rows[i].column)) {
          ahead.add(i);
        }
      }
    }
    return ahead;
  }, [columnsWithLabels, rows]);

  const totalLaneWidth = useMemo(() => columns.length * (LANE_WIDTH + LANE_GAP), [columns]);
  const visibleRows = useMemo(() => rows.slice(0, visibleCount), [rows, visibleCount]);
  const totalHeight = useMemo(() => visibleRows.length * ROW_HEIGHT + 8, [visibleRows]);

  const handleLabelClick = useCallback((colIndices: number[]) => {
    const id = `col-${colIndices[0]}`;
    setSelectedLabels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const nodeStroke = isDark ? '#1a1a1a' : '#ffffff';

  // Row hover state — drives SVG node enlargement in SvgLanes.
  // Stabilized via useCallback so CommitTableRows memo does not break.
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const onRowHover = useCallback((id: string | null) => {
    setHoveredRowId(id);
  }, []);

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
      <TagRow
        tagRowOrder={tagRowOrder}
        columnsWithLabels={columnsWithLabels}
        filterColumns={filterColumns}
        draggedId={draggedId}
        overId={overId}
        isDark={isDark}
        handleMouseDown={handleMouseDown}
        handleLabelClick={handleLabelClick}
        selectedLabels={selectedLabels}
        setSelectedLabels={setSelectedLabels}
        t={t}
      />
      <div className="adl-branch-graph__body">
        <div className="adl-branch-graph__panels">
          <div className="adl-branch-graph__lanes-panel">
            <div className="adl-branch-graph__lanes-spacer" />
            <SvgLanes
              rows={visibleRows}
              columns={columns}
              columnOrder={columnOrder}
              edges={adapted?.edges ?? []}
              totalWidth={totalLaneWidth}
              totalHeight={totalHeight}
              nodeStroke={nodeStroke}
              filterColumns={deferredFilterColumns}
              hoveredBranch={null}
              hoveredRowId={hoveredRowId}
              aheadRows={aheadRows}
              activeRefLabel={deferredActiveRefLabel}
            />
          </div>
          <CommitTableRows
            visibleRows={visibleRows}
            filterColumns={deferredFilterColumns}
            activeRefLabel={deferredActiveRefLabel}
            hoveredLabel={null}
            onRowHover={onRowHover}
            theme={theme}
            t={t}
            locale={locale}
          />
        </div>
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
          <div className="adl-branch-graph__bottom-bar">
            {t.gitVisAllLoaded?.replace('{count}', String(rows.length))}
          </div>
        )}
      </div>
    </div>
  );
}
