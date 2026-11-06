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
import { computeBranchOwnership } from '../utils/branchOwnership';
import { computeMergedBranches } from '../utils/branchMergeStatus';
import { resolveRowDisplay } from '../utils/branchRowDisplay';
import {
  assignBranchColorSlots,
  buildRefLabelColorMap,
  compareBranchNames,
  getRefLabelColor,
  isLocalBranchName,
} from '../utils/branchLabelColors';
import { readJson, writeJson } from '@stores/storageHelpers';
import { IconFileText } from '@icons/status';
import type { ColumnInfo } from '../hooks/useLaneAssignment';
import type { RawBranchGraph } from '../adapters/chartDataAdapters';
import type { CommitNode, CommitEdge } from '../types/gitGraph';
import type { ChartStatus } from '@/components/charts/chart-phase';
import { ChartLoadingLabel } from '@/components/charts/chart-loading-label';
import { GitNotRepoHint } from '../GitNotRepoHint';

// ── Constants ──
const emptyArr: never[] = [];
const LANE_WIDTH = 24;
const LANE_GAP = 8;
const ROW_HEIGHT = 36;
const NODE_RADIUS = 6;
const MERGE_NODE_SIZE = 12;
const INITIAL_LOAD = 50;
const LOAD_MORE = 30;
const BRANCH_COLOR_STORAGE_KEY = 'adl-git-vis:branch-colors';

/**
 * Persisted name → slot map. Persisting outside React keeps colors stable
 * across refreshes / restarts: existing assignments are reused, so only a
 * newly seen branch needs a free slot.
 */
function loadBranchColorSlots(): Record<string, number> {
  const stored = readJson<unknown>(BRANCH_COLOR_STORAGE_KEY, {});
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return Object.create(null);
  }
  // Slot-level sanitization is centralized in assignBranchColorSlots; this
  // function only guards the JSON shape.
  return stored as Record<string, number>;
}

function branchColorSlotsEqual(
  a: Readonly<Record<string, number>>,
  b: Readonly<Record<string, number>>,
): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) {
    return false;
  }
  return aKeys.every((key) => a[key] === b[key]);
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
      // Still call getAvatar to fulfill the SWR contract: if the cached entry
      // is stale, getAvatar triggers a background revalidation that updates
      // the cache. The fresh URL will take effect on the next useEffect run
      // (e.g. when the row re-enters the viewport). If the entry is fresh,
      // getAvatar returns the same URL (no-op).
      let cancelled = false;
      getAvatar(email, size).then((freshUrl) => {
        if (!cancelled && freshUrl && freshUrl !== cached) {
          setSrc(freshUrl);
        }
      });
      return () => {
        cancelled = true;
      };
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

interface BranchProgress {
  ahead: number;
  behind: number;
  mergeBase?: string;
}

interface BranchLabel {
  name: string;
  progress?: BranchProgress;
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
  edges: CommitEdge[];
  totalWidth: number;
  totalHeight: number;
  nodeStroke: string;
  ownership: Map<string, string>;
  branchColorMap: ReadonlyMap<string, string>;
  selectedBranches: Set<string>;
  hoveredRowId: string | null;
  aheadRows: Set<number>;
}

const SvgLanes = React.memo(
  function SvgLanes({
    rows,
    columns,
    edges,
    totalWidth,
    totalHeight,
    nodeStroke,
    ownership,
    branchColorMap,
    selectedBranches,
    hoveredRowId,
    aheadRows,
  }: SvgLanesProps) {
    const nodeY = (rowIndex: number) => rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
    const rowDisplay = useCallback(
      (row: RowData) =>
        resolveRowDisplay(row.node, row.color, ownership, selectedBranches, branchColorMap),
      [branchColorMap, ownership, selectedBranches],
    );
    const rowIndexById = useMemo(() => {
      const map = new Map<string, number>();
      rows.forEach((r, i) => map.set(r.node.id, i));
      return map;
    }, [rows]);

    const columnLines = useMemo(() => {
      const els: React.ReactElement[] = [];
      for (const col of columns) {
        const x = getLaneX(col.index);
        const laneRows = rows
          .map((r, i) => ({ row: r, i }))
          .filter(({ row }) => row.column === col.index);
        if (laneRows.length < 2) {
          continue;
        }
        // Split the lane into ownership segments so each run matches its branch
        // label color (the stable getRefLabelColor) instead of the raw lane
        // palette color. When filtering, each segment dims independently based
        // on whether its owning branch is selected.
        for (let s = 0; s < laneRows.length - 1; s += 1) {
          const { row: upperRow, i: i1 } = laneRows[s];
          const { i: i2 } = laneRows[s + 1];
          const display = rowDisplay(upperRow);
          const segmentDimmed = !display.selected;
          els.push(
            <line
              key={`col-${col.index}-${s}`}
              x1={x}
              y1={nodeY(i1)}
              x2={x}
              y2={nodeY(i2)}
              stroke={display.color}
              strokeWidth={3}
              strokeLinecap="round"
              opacity={segmentDimmed ? 0.1 : 0.5}
            />,
          );
        }
      }
      return els;
    }, [columns, rows, rowDisplay]);

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
        const sx = getLaneX(sourceRow.column);
        const sy = nodeY(sourceIdx);
        const tx = getLaneX(targetRow.column);
        const ty = nodeY(targetIdx);
        const sourceDisplay = rowDisplay(sourceRow);
        const stroke = sourceDisplay.color;

        const edgeDimmed = !sourceDisplay.selected && !rowDisplay(targetRow).selected;

        if (sourceRow.column === targetRow.column) {
          result.push(
            <line
              key={`edge-${edge.source}-${edge.target}`}
              x1={sx}
              y1={sy}
              x2={tx}
              y2={ty}
              stroke={stroke}
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
              stroke={stroke}
              strokeWidth={2}
              strokeDasharray={sourceIdx > targetIdx ? '4,3' : 'none'}
              opacity={edgeDimmed ? 0.1 : 0.6}
            />,
          );
        }
      }
      return result;
    }, [edges, rowIndexById, rows, rowDisplay]);

    const nodes = useMemo(
      () =>
        rows.map((row, i) => {
          const x = getLaneX(row.column);
          const y = nodeY(i);
          const isHovered = row.node.id === hoveredRowId;
          const r = isHovered ? NODE_RADIUS + 2 : NODE_RADIUS;
          const display = rowDisplay(row);
          const nodeDimmed = !display.selected;
          const fill = display.color;
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
                  stroke={fill}
                  strokeWidth={isHovered ? 3.5 : 2.5}
                />
                <circle cx={x + 14} cy={y - 8} r={8} fill={fill} opacity={0.15} />
                <text
                  x={x + 14}
                  y={y - 5}
                  textAnchor="middle"
                  fontSize={8}
                  fill={fill}
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
                fill={fill}
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
              fill={fill}
              stroke={nodeStroke}
              strokeWidth={isHovered ? 3 : 2}
              opacity={nodeDimmed ? 0.1 : aheadRows.has(i) ? 0.65 : 1}
            />
          );
        }),
      [rows, hoveredRowId, nodeStroke, aheadRows, rowDisplay],
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
    prev.edges === next.edges &&
    prev.totalWidth === next.totalWidth &&
    prev.totalHeight === next.totalHeight &&
    prev.nodeStroke === next.nodeStroke &&
    prev.ownership === next.ownership &&
    prev.branchColorMap === next.branchColorMap &&
    prev.selectedBranches === next.selectedBranches &&
    prev.hoveredRowId === next.hoveredRowId &&
    prev.aheadRows === next.aheadRows,
);

// ── Extracted Commit Table Rows (memo'd to prevent re-render on hoveredId change) ──

interface CommitTableRowsProps {
  visibleRows: RowData[];
  ownership: Map<string, string>;
  branchColorMap: ReadonlyMap<string, string>;
  selectedBranches: Set<string>;
  onRowHover: (id: string | null) => void;
  theme: ReturnType<typeof useBklitTheme>;
  t: ReturnType<typeof useTCopy>['t'];
  locale: string;
}

const CommitTableRows = React.memo(
  function CommitTableRows({
    visibleRows,
    ownership,
    branchColorMap,
    selectedBranches,
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
            gridTemplateColumns: 'var(--adl-branch-graph-table-cols)',
            gap: 8,
            padding: '4px 8px',
            fontSize: 11,
            fontWeight: 600,
            color: theme.muted,
            borderBottom: `1px solid ${theme.grid}`,
          }}
        >
          {/* Single-line + ellipsis is enforced by `.adl-branch-graph__header > span`
              (git-visualization.css); `title` keeps the full label readable on hover
              when a narrow panel truncates it. */}
          <span title={t.gitVisHash}>{t.gitVisHash}</span>
          <span title={t.gitVisMessage}>{t.gitVisMessage}</span>
          <span title={t.gitVisAuthor}>{t.gitVisAuthor}</span>
          <span title={t.gitVisDate}>{t.gitVisDate}</span>
        </div>
        {visibleRows.map((row) => {
          const owner = ownership.get(row.node.id);
          const display = resolveRowDisplay(
            row.node,
            row.color,
            ownership,
            selectedBranches,
            branchColorMap,
          );
          const isFiltered = !display.selected;
          const additionalRefs =
            row.node.refs?.filter(
              (ref) =>
                ref !== owner &&
                ref !== row.node.branch &&
                !ref.startsWith('origin/') &&
                !ref.startsWith('upstream/'),
            ) ?? [];
          return (
            <div
              key={row.node.id}
              className={`adl-branch-graph__row${isFiltered ? ' adl-branch-graph__row--dimmed' : ''}`}
              data-branch={owner ?? row.node.branch}
              onMouseEnter={() => onRowHover(row.node.id)}
              onMouseLeave={() => onRowHover(null)}
              style={{
                display: 'grid',
                gridTemplateColumns: 'var(--adl-branch-graph-table-cols)',
                gap: 8,
                padding: '4px 8px',
                fontSize: 12,
                lineHeight: ROW_HEIGHT - 8 + 'px',
                cursor: 'default',
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
                  minWidth: 0,
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                }}
              >
                <AuthorAvatar name={row.node.author} email={row.node.authorEmail} />
                <span
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {row.node.author}
                </span>
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
                  maxWidth={400}
                  className="adl-hint-card"
                >
                  <button
                    type="button"
                    className="adl-branch-graph__info-btn"
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    <IconFileText size={14} />
                  </button>
                </TooltipSimple>
              </span>
              <span
                style={{
                  color: theme.muted,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  minWidth: 0,
                }}
              >
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
    prev.ownership === next.ownership &&
    prev.branchColorMap === next.branchColorMap &&
    prev.selectedBranches === next.selectedBranches &&
    prev.onRowHover === next.onRowHover &&
    prev.theme === next.theme &&
    prev.t === next.t &&
    prev.locale === next.locale,
);

// ── Extracted Tag Row (memo'd to prevent re-render of table/SVG during drag) ──

interface TagRowProps {
  tagRowOrder: string[];
  branchLabels: BranchLabel[];
  branchColorMap: ReadonlyMap<string, string>;
  draggedId: string | null;
  overId: string | null;
  isDark: boolean;
  handleMouseDown: (id: string) => (e: React.MouseEvent) => void;
  selectedLabels: Set<string>;
  toggleBranch: (name: string) => void;
  mergedBranches: Set<string>;
  t: ReturnType<typeof useTCopy>['t'];
}

const TagRow = React.memo(function TagRow({
  tagRowOrder,
  branchLabels,
  branchColorMap,
  draggedId,
  overId,
  isDark,
  handleMouseDown,
  selectedLabels,
  toggleBranch,
  mergedBranches,
  t,
}: TagRowProps) {
  const tagRowRef = useRef<HTMLDivElement>(null);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  // 嵌套滚动隔离：React onWheel 是被动监听（preventDefault 无效），改用原生
  // 非被动监听接管标签行的纵滚→横滚，并在行内消化事件，不冒泡到图表纵滚。
  useEffect(() => {
    const el = tagRowRef.current;
    if (!el) {
      return;
    }
    const onWheel = (e: WheelEvent) => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (maxScroll <= 0) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const absDx = Math.abs(e.deltaX);
      const absDy = Math.abs(e.deltaY);
      el.scrollLeft += absDx > absDy ? e.deltaX : e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const labelByOrder = useMemo(() => {
    const byName = new Map(branchLabels.map((l) => [l.name, l]));
    return tagRowOrder
      .map((itemId) => (itemId.startsWith('br:') ? (byName.get(itemId.slice(3)) ?? null) : null))
      .filter((l): l is BranchLabel => l !== null);
  }, [branchLabels, tagRowOrder]);

  return (
    <div ref={tagRowRef} className="adl-branch-graph__tag-row--sticky">
      {labelByOrder.map((label) => {
        const itemId = `br:${label.name}`;
        const isActive = selectedLabels.has(itemId);
        const isHovered = hoveredLabel === label.name;
        const showIndicator = isActive || isHovered;
        const showScale = isHovered !== isActive;
        const bp = label.progress;
        // A fully merged branch takes priority: label — 已并入 main. Branches
        // with a remote keep the ahead/behind summary; local-only branches fall
        // back to the plain "仅本地" hint.
        const title = mergedBranches.has(label.name)
          ? label.name + ' — ' + t.gitVisMergedIntoMain
          : bp
            ? bp.mergeBase
              ? t.gitVisProgressTooltip
                  .replace('{label}', label.name)
                  .replace('{ahead}', String(bp.ahead))
                  .replace('{behind}', String(bp.behind)) +
                ' | ' +
                t.gitVisProgressBase +
                ': ' +
                bp.mergeBase.substring(0, 7)
              : label.name + ' — ' + t.gitVisLocalOnly
            : label.name;
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
              onClick={() => toggleBranch(label.name)}
              onMouseEnter={() => !draggedId && setHoveredLabel(label.name)}
              onMouseLeave={() => !draggedId && setHoveredLabel(null)}
              style={{
                padding: '2px 8px',
                borderRadius: 0,
                background: getRefLabelColor(label.name, branchColorMap),
                fontSize: 11,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                lineHeight: 1,
                opacity: 1,
              }}
            >
              <span className="adl-branch-graph__label-text" title={title}>
                {label.name}
              </span>
              {bp && (bp.ahead > 0 || bp.behind > 0) ? (
                <span className="adl-branch-graph__label-progress" style={{ marginLeft: 2 }}>
                  {bp.ahead > 0 && (
                    <span>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>↑</span>
                      <span style={{ fontSize: 11 }}>{bp.ahead}</span>
                    </span>
                  )}
                  {bp.behind > 0 && (
                    <span>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>↓</span>
                      <span style={{ fontSize: 11 }}>{bp.behind}</span>
                    </span>
                  )}
                </span>
              ) : null}
            </button>
          </div>
        );
      })}
    </div>
  );
});

// ── Loading skeleton (bklit-ui aligned: CSS shimmer rows + centered Loading label) ──

const SKELETON_ROW_COUNT = 10;
const SKELETON_LANE_COUNT = 4;
const SKELETON_ROW_HEIGHT = 36;

const BranchGraphLoading = React.memo(function BranchGraphLoading({ label }: { label?: string }) {
  // A deterministic "linked list" of lanes: vertical lane lines with commit
  // nodes and connecting edges, mirroring the real SvgLanes topology. Consecutive
  // commits sometimes stay on one lane (straight edge) and sometimes switch lanes
  // (cubic curve), which is what makes it read as a linked list.
  const laneXs = Array.from({ length: SKELETON_LANE_COUNT }, (_, i) => 16 + i * 30);
  const laneByRow = Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => {
    if (i % 4 === 3) {
      return (i - 1) % SKELETON_LANE_COUNT; // stay on the previous lane → straight edge
    }
    return i % SKELETON_LANE_COUNT;
  });
  const nodeY = (i: number) => i * SKELETON_ROW_HEIGHT + SKELETON_ROW_HEIGHT / 2;
  const svgHeight = SKELETON_ROW_COUNT * SKELETON_ROW_HEIGHT;
  return (
    <div className="adl-git-vis__chart adl-git-vis__chart-loading" style={{ overflowX: 'hidden' }}>
      {/* Mirrors the ready TagRow: a row of rectangular branch tag pills. */}
      <div className="adl-branch-graph__skeleton-tags">
        {Array.from({ length: 4 }, (_, i) => (
          <span
            key={i}
            className="adl-branch-graph__skeleton-tag"
            style={{ width: `${46 + (i % 3) * 18}px` }}
          />
        ))}
      </div>
      {/* Mirrors the ready body: lanes panel (泳道链表) + table header + rows. */}
      <div className="adl-branch-graph__skeleton-body">
        <div className="adl-branch-graph__skeleton-lanes-panel">
          <svg
            aria-hidden
            className="adl-branch-graph__skeleton-lanes-svg"
            height={svgHeight}
            width={laneXs.at(-1)! + 16}
          >
            {laneXs.map((x) => (
              <line
                key={`lane-${x}`}
                className="adl-branch-graph__skeleton-lane-line"
                x1={x}
                x2={x}
                y1={0}
                y2={svgHeight}
              />
            ))}
            {laneByRow.slice(1).map((lane, i) => {
              const prev = laneByRow[i];
              const y1 = nodeY(i);
              const y2 = nodeY(i + 1);
              if (prev === lane) {
                return (
                  <line
                    key={`edge-${i}`}
                    className="adl-branch-graph__skeleton-lane-edge"
                    x1={laneXs[prev]}
                    x2={laneXs[lane]}
                    y1={y1}
                    y2={y2}
                  />
                );
              }
              const midY = (y1 + y2) / 2;
              return (
                <path
                  key={`edge-${i}`}
                  className="adl-branch-graph__skeleton-lane-edge"
                  d={`M ${laneXs[prev]} ${y1} C ${laneXs[prev]} ${midY}, ${laneXs[lane]} ${midY}, ${laneXs[lane]} ${y2}`}
                />
              );
            })}
            {laneByRow.map((lane, i) => (
              <circle
                key={`node-${i}`}
                className="adl-branch-graph__skeleton-lane-node"
                cx={laneXs[lane]}
                cy={nodeY(i)}
                r={5}
              />
            ))}
          </svg>
        </div>
        <div className="adl-branch-graph__skeleton-table">
          <div className="adl-branch-graph__skeleton-table-header">
            <span className="adl-branch-graph__skeleton-cell adl-branch-graph__skeleton-cell--hash" />
            <span className="adl-branch-graph__skeleton-cell adl-branch-graph__skeleton-cell--message" />
            <span className="adl-branch-graph__skeleton-cell adl-branch-graph__skeleton-cell--author" />
            <span className="adl-branch-graph__skeleton-cell adl-branch-graph__skeleton-cell--date" />
          </div>
          {Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => (
            <div key={i} className="adl-branch-graph__skeleton-row" style={{ height: 36 }}>
              <span className="adl-branch-graph__skeleton-cell adl-branch-graph__skeleton-cell--hash" />
              <span className="adl-branch-graph__skeleton-cell adl-branch-graph__skeleton-cell--message" />
              <span className="adl-branch-graph__skeleton-cell adl-branch-graph__skeleton-cell--author" />
              <span className="adl-branch-graph__skeleton-cell adl-branch-graph__skeleton-cell--date" />
            </div>
          ))}
        </div>
      </div>
      <ChartLoadingLabel text={label} />
    </div>
  );
});

// ── Main component ──

interface BranchGraphProps {
  data?: RawBranchGraph;
  status?: ChartStatus;
  loadingLabel?: string;
  /** Whether the current workspace is a Git repository */
  isGitRepo?: boolean;
  /** Whether a workspace is selected */
  hasWorkspace?: boolean;
  /** Whether the git snapshot has been loaded (false during initial async load) */
  isGitSnapshotLoaded?: boolean;
}

export function BranchGraph({
  data,
  status = 'ready',
  loadingLabel,
  isGitRepo = true,
  hasWorkspace = true,
  isGitSnapshotLoaded = true,
}: BranchGraphProps) {
  const { t } = useTCopy();
  const locale = navigator.language || 'en-US';
  const theme = useBklitTheme();

  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set());
  const deferredSelectedLabels = useDeferredValue(selectedLabels);
  const selectedBranches = useMemo(() => {
    const set = new Set<string>();
    for (const id of deferredSelectedLabels) {
      if (id.startsWith('br:')) {
        set.add(id.slice(3));
      }
    }
    return set;
  }, [deferredSelectedLabels]);

  const adapted = useMemo(() => (data ? adaptBranchGraphData(data) : null), [data]);

  // Persisted name → slot assignment. Valid recorded slots are reused
  // verbatim; only names without a recorded slot consume a free slot.
  const [branchColorSlots, setBranchColorSlots] =
    useState<Record<string, number>>(loadBranchColorSlots);
  const allBranchNames = adapted?.allBranches ?? emptyArr;
  const branchColorMap = useMemo(
    () => buildRefLabelColorMap(allBranchNames, branchColorSlots),
    [allBranchNames, branchColorSlots],
  );
  useEffect(() => {
    // Keep stored colors when the graph has no local branches (initial load /
    // empty workspace) instead of treating history as a complete snapshot.
    if (!allBranchNames.some(isLocalBranchName)) {
      return;
    }
    const next = assignBranchColorSlots(allBranchNames, branchColorSlots);
    if (branchColorSlotsEqual(next, branchColorSlots)) {
      return;
    }
    setBranchColorSlots(next);
    writeJson(BRANCH_COLOR_STORAGE_KEY, next);
  }, [allBranchNames, branchColorSlots]);

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
      // getAvatar internally catches all errors and returns null on failure,
      // so no .catch() is needed here — pixel avatar remains as fallback.
      void getAvatar(node.authorEmail, 32);
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

  // Branch ownership: commit → owning local branch (mainline first-parent spine,
  // nearest-tip for the rest). Drives node/lane coloring, filtering and the
  // unpushed (translucent) marker.
  const ownership = useMemo(() => {
    if (!adapted) {
      return new Map<string, string>();
    }
    return computeBranchOwnership(adapted.nodes, adapted.edges, adapted.allBranches);
  }, [adapted]);

  // Branches whose tips are all reachable from the mainline (fully merged).
  // Drives the "已并入 main" hint on the branch label tooltip. Computed purely
  // from the graph — mirrors `git merge-base --is-ancestor B main`.
  const mergedBranches = useMemo(() => {
    if (!adapted) {
      return new Set<string>();
    }
    return computeMergedBranches(adapted.nodes, adapted.edges, adapted.allBranches);
  }, [adapted]);

  // ── Flat tag row order (branch labels) ──
  // Stored as state so drag positions are preserved.
  const buildTagOrder = useCallback((labels: BranchLabel[]): string[] => {
    return labels.map((l) => `br:${l.name}`);
  }, []);
  const [tagRowOrder, setTagRowOrder] = useState<string[]>([]);

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

  // One label per LOCAL branch, ordered mainline-first then alphabetically.
  // Stable per-branch color + branchProgress tooltip replaces the old
  // column-derived labels (which mis-assigned main's label/color when a local
  // branch took over a shared column).
  const branchLabels = useMemo((): BranchLabel[] => {
    if (!adapted) {
      return [];
    }
    const progress = adapted.branchProgress ?? {};
    const local = (adapted.allBranches ?? []).filter(isLocalBranchName);
    return [...local].sort(compareBranchNames).map((name) => ({ name, progress: progress[name] }));
  }, [adapted]);

  // Merge new labels when data loads, preserving drag-adjusted positions
  const prevMergeKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const fresh = buildTagOrder(branchLabels);
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
  }, [branchLabels, buildTagOrder]);

  // Rows whose commits are not yet pushed to the branch's remote → translucent.
  // A local branch without a remote (mergeBase absent) marks ALL its commits;
  // otherwise only commits that are not ancestors of the merge base are unpushed.
  const aheadRows = useMemo(() => {
    const ahead = new Set<number>();
    if (!adapted || rows.length === 0) {
      return ahead;
    }
    const progress = adapted.branchProgress ?? {};
    const parentMap = computeParentMap(adapted.edges);
    const baseAncestors = new Map<string, Set<string>>();
    for (const bp of Object.values(progress)) {
      if (!bp.mergeBase || baseAncestors.has(bp.mergeBase)) {
        continue;
      }
      const baseRow = rows.find((r) => r.node.hash === bp.mergeBase);
      if (!baseRow) {
        continue;
      }
      const ancestors = new Set<string>();
      const stack = [baseRow.node.id];
      while (stack.length > 0) {
        const id = stack.pop()!;
        if (ancestors.has(id)) {
          continue;
        }
        ancestors.add(id);
        for (const p of parentMap.get(id) ?? []) {
          stack.push(p);
        }
      }
      baseAncestors.set(bp.mergeBase, ancestors);
    }
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const owner = ownership.get(row.node.id);
      if (!owner) {
        continue;
      }
      const bp = progress[owner];
      if (!bp) {
        continue;
      }
      if (!bp.mergeBase) {
        ahead.add(i);
        continue;
      }
      const ancestors = baseAncestors.get(bp.mergeBase);
      if (!ancestors || !ancestors.has(row.node.id)) {
        ahead.add(i);
      }
    }
    return ahead;
  }, [adapted, rows, ownership]);

  const totalLaneWidth = useMemo(() => columns.length * (LANE_WIDTH + LANE_GAP), [columns]);
  const visibleRows = useMemo(() => rows.slice(0, visibleCount), [rows, visibleCount]);
  const totalHeight = useMemo(() => visibleRows.length * ROW_HEIGHT + 8, [visibleRows]);

  const toggleBranch = useCallback((name: string) => {
    setSelectedLabels((prev) => {
      const id = `br:${name}`;
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

  if (!hasWorkspace) {
    return <GitNotRepoHint className="adl-git-vis__chart" message={t.gitVisNoWorkspace} />;
  }

  if (!isGitRepo && isGitSnapshotLoaded) {
    return <GitNotRepoHint className="adl-git-vis__chart" />;
  }

  if (status === 'loading' || !isGitSnapshotLoaded) {
    return <BranchGraphLoading label={loadingLabel} />;
  }

  if (!hasData) {
    return <div className="adl-git-vis__chart" ref={chartContainerRef} />;
  }

  return (
    <div className="adl-git-vis__chart" ref={chartContainerRef} style={{ overflowX: 'hidden' }}>
      <TagRow
        tagRowOrder={tagRowOrder}
        branchLabels={branchLabels}
        branchColorMap={branchColorMap}
        draggedId={draggedId}
        overId={overId}
        isDark={isDark}
        handleMouseDown={handleMouseDown}
        selectedLabels={selectedLabels}
        toggleBranch={toggleBranch}
        mergedBranches={mergedBranches}
        t={t}
      />
      <div className="adl-branch-graph__body">
        <div className="adl-branch-graph__panels">
          <div className="adl-branch-graph__lanes-panel">
            <div className="adl-branch-graph__lanes-spacer" />
            <SvgLanes
              rows={visibleRows}
              columns={columns}
              edges={adapted?.edges ?? []}
              totalWidth={totalLaneWidth}
              totalHeight={totalHeight}
              nodeStroke={nodeStroke}
              ownership={ownership}
              branchColorMap={branchColorMap}
              selectedBranches={selectedBranches}
              hoveredRowId={hoveredRowId}
              aheadRows={aheadRows}
            />
          </div>
          <CommitTableRows
            visibleRows={visibleRows}
            ownership={ownership}
            branchColorMap={branchColorMap}
            selectedBranches={selectedBranches}
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
