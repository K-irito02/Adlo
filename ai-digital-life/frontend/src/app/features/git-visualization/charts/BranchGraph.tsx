import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { CopyButton } from '@components/CopyButton';
import { TooltipSimple } from '@components/Tooltip';
import { useBklitTheme } from '../hooks/useBklitTheme';
import { adaptBranchGraphData } from '../adapters/chartDataAdapters';
import { useLaneAssignment } from '../hooks/useLaneAssignment';
import { formatDate, resolveAvatarUrl, md5 } from '../utils/commitTooltipUtils';
import { IconFileText } from '@icons/status';
import type { ColumnInfo } from '../hooks/useLaneAssignment';
import type { RawBranchGraph } from '../adapters/chartDataAdapters';
import type { CommitNode, CommitEdge, MergedSubBranch } from '../../../../test-fixtures/gitVisMockData';

// ── Constants ──
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
  src?: string;
  email?: string;
  size?: number;
}

const AuthorAvatar = React.memo(function AuthorAvatar({
  name,
  src,
  email,
  size = 20,
}: AuthorAvatarProps) {
  const [useGravatar, setUseGravatar] = useState(false);

  const gravatarSrc = email
    ? `https://www.gravatar.com/avatar/${md5(email.trim().toLowerCase())}?s=${size}&d=retro`
    : undefined;

  const currentSrc = useGravatar ? gravatarSrc : src;

  if (currentSrc) {
    return (
      <img
        className="adl-author-avatar"
        src={currentSrc}
        alt={name}
        onError={() => {
          if (!useGravatar && gravatarSrc) {
            setUseGravatar(true);
          }
        }}
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

  return null;
});

/**
 * Render supplementary ref labels as separate tag row buttons.
 *
 * Fix for Issue 1 (hover indicator/scale on ref labels):
 * See design spec: docs/superpowers/specs/2026-07-29-branch-graph-tag-hover-and-head-annotation-design.md
 *
 * Each ref label button mirrors the main column label behavior:
 * - data-indicator: shows/hides the ::before indicator bar above the label
 * - data-scale: applies transform: scale(1.06) on hover (XOR with selected state)
 *
 * The hoveredLabel state is shared with column labels via setHoveredLabel.
 * activeRefLabel tracks the currently selected (clicked) ref label for dimming.
 */
function renderRefLabels(
  rls: RefLabelInfo[],
  activeRefLabel: string | null,
  setActiveRefLabel: (v: string | null) => void,
  hoveredLabel: string | null,
  setHoveredLabel: (label: string | null) => void,
  t: { gitVisLocalOnly?: string },
) {
  return rls.map((rl) => {
    const isActive = activeRefLabel === rl.name;
    const showIndicator = hoveredLabel === rl.name || activeRefLabel === rl.name;
    const showScale = (hoveredLabel === rl.name) !== (activeRefLabel === rl.name);
    const bgColor = getRefLabelColor(rl.name);
    return (
      <div key={`rl-${rl.name}`} className="adl-branch-graph__label-drag" style={{ opacity: 1 }}>
        <button
          className="adl-branch-graph__label"
          data-indicator={showIndicator ? 'true' : undefined}
          data-scale={showScale ? 'true' : undefined}
          onClick={() => setActiveRefLabel(isActive ? null : rl.name)}
          onMouseEnter={() => setHoveredLabel(rl.name)}
          onMouseLeave={() => setHoveredLabel(null)}
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
          title={t.gitVisLocalOnly ? rl.name + ' — ' + t.gitVisLocalOnly : rl.name}
        >
          {rl.name}
        </button>
      </div>
    );
  });
}

// ── Commit Tooltip Card ──
// Annotation priority system (Issue 2):
// See design spec: docs/superpowers/specs/2026-07-29-branch-graph-tag-hover-and-head-annotation-design.md
//
// Priority 1 (highest): isBranchHead + local-only (branchProgress exists, no mergeBase) → "仅本地"
// Priority 2:          localRefs.length > 0                                         → "已合并"
// Priority 3:          isBranchHead + has remote tracking                           → "分支头"
// Priority 4:          none of the above                                            → no annotation
//
// isBranchHead is computed externally by matching the first occurrence of each
// branch name in topological order (sortedIds). See branchHeads useMemo below.

interface CommitTooltipCardProps {
  hash: string;
  message: string;
  author: string;
  authorEmail: string;
  date: string;
  branch: string;
  refs: string[];
  branchProgress?: { ahead: number; behind: number; mergeBase?: string };
  tag?: string;
  isBranchHead?: boolean;
  columnLabel?: string;
  mergedSubBranches?: MergedSubBranch[];
}

const CommitTooltipCard = React.memo(function CommitTooltipCard({
  hash,
  message,
  author,
  authorEmail,
  date,
  branch,
  refs,
  branchProgress,
  tag,
  isBranchHead,
  columnLabel,
  mergedSubBranches,
}: CommitTooltipCardProps) {
  const { t } = useTCopy();
  const locale = navigator.language || 'en-US';
  const effectiveBranch = branch || columnLabel || '';
  const displayBranch = effectiveBranch.replace(/^origin\//, '').replace(/^upstream\//, '');

  const localRefs = refs.filter(
    (r) => r !== branch && !r.startsWith('origin/') && !r.startsWith('upstream/'),
  );
  const remoteRefs = refs.filter(
    (r) => r !== branch && (r.startsWith('origin/') || r.startsWith('upstream/')),
  );

  return (
    <div className="adl-branch-graph__tooltip-card">
      <div className="adl-branch-graph__tooltip-hash">
        {hash}
        <span className="adl-branch-graph__copy-hash">
          <CopyButton text={hash} size={11} tooltip={t.gitVisCopyHash} nativeTooltip />
        </span>
      </div>

      <hr className="adl-branch-graph__tooltip-divider" />

      <div className="adl-branch-graph__tooltip-message">{message}</div>

      <hr className="adl-branch-graph__tooltip-divider" />

      <div className="adl-branch-graph__tooltip-author">
        <AuthorAvatar
          name={author}
          src={resolveAvatarUrl(authorEmail, 32)}
          email={authorEmail}
          size={32}
        />
        <div className="adl-branch-graph__tooltip-author-info">
          <span className="adl-branch-graph__tooltip-author-name">{author}</span>
          <span className="adl-branch-graph__tooltip-author-email">{authorEmail}</span>
        </div>
      </div>

      <hr className="adl-branch-graph__tooltip-divider" />

      <div className="adl-branch-graph__tooltip-date">{formatDate(date, locale, 'tooltip')}</div>

      {(branch || localRefs.length > 0 || remoteRefs.length > 0 || tag) && (
        <>
          <hr className="adl-branch-graph__tooltip-divider" />
          <div className="adl-branch-graph__tooltip-branches">
            <div className="adl-branch-graph__tooltip-branches-label">{t.gitVisBranches}</div>
            <div className="adl-branch-graph__tooltip-branches-list">
              {/* Primary branch with ahead/behind */}
              {/* Annotation priority (see design spec):
                  Priority 1: isBranchHead + local-only → "仅本地"
                  Priority 2: localRefs.length > 0     → "已合并"
                  Priority 3: isBranchHead + remote    → "分支头"
                  Priority 4: neither                  → no annotation */}
              {effectiveBranch && (
                <span className="adl-branch-graph__tooltip-branch-badge adl-branch-graph__tooltip-branch-badge--primary">
                  {displayBranch}
                  {(() => {
                    // Annotation priority system (see design spec):
                    // Only shown for actual node.branch (HEAD commits), not for column-label fallback
                    // Priority 1: isBranchHead + local-only (branchProgress exists, no mergeBase) → "仅本地"
                    // Priority 2: localRefs.length > 0                                          → "已合并"
                    // Priority 3: isBranchHead + has remote tracking                            → "分支头"
                    // Priority 4: neither                                                       → no annotation
                    if (branch && isBranchHead && branchProgress && !branchProgress.mergeBase) {
                      return ` | ${t.gitVisLocalOnly}`;
                    }
                    if (branch && localRefs.length > 0) {
                      return ` | ${t.gitVisMerged}`;
                    }
                    if (branch && isBranchHead) {
                      return ` | ${t.gitVisBranchHead ?? 'branch head'}`;
                    }
                    return '';
                  })()}
                  {branchProgress && (branchProgress.ahead > 0 || branchProgress.behind > 0) && (
                    <span className="adl-branch-graph__tooltip-branch-progress">
                      {branchProgress.ahead > 0 && <span>↑{branchProgress.ahead}</span>}
                      {branchProgress.behind > 0 && <span>↓{branchProgress.behind}</span>}
                    </span>
                  )}
                </span>
              )}
              {/* Merged sub-branches from merge commits */}
              {mergedSubBranches && mergedSubBranches.length > 0 && mergedSubBranches.map((msb) => (
                <span
                  key={msb.id}
                  className="adl-branch-graph__tooltip-branch-badge"
                >
                  {msb.id} · {t.gitVisMergeMerged}
                  {msb.isDeleted && ` · ${t.gitVisMergeDeleted}`}
                </span>
              ))}
              {/* Additional local branches (merged into current branch) */}
              {localRefs.map((ref) => (
                <span
                  key={ref}
                  className="adl-branch-graph__tooltip-branch-badge"
                  title={t.gitVisMerged}
                >
                  {ref} ({t.gitVisMerged})
                </span>
              ))}
              {/* Remote tracking branches */}
              {remoteRefs.length > 0 && localRefs.length > 0 && <br />}
              {remoteRefs.map((ref) => (
                <span key={ref} className="adl-branch-graph__tooltip-remote-badge">
                  {ref}
                </span>
              ))}
            </div>
            {/* Tag */}
            {tag && (
              <div className="adl-branch-graph__tooltip-tag-row">
                <span className="adl-branch-graph__tooltip-tag-badge">{tag}</span>
              </div>
            )}
          </div>
        </>
      )}
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
  edges: CommitEdge[];
  totalWidth: number;
  totalHeight: number;
  hoveredId: string | null;
  nodeStroke: string;
  filterColumns: Set<number>;
  hoveredBranch: string | null;
  aheadRows: Set<number>;
  activeRefLabel: string | null;
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
  activeRefLabel,
}: SvgLanesProps) {
  const nodeY = (rowIndex: number) => rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

  const refLabelColor = activeRefLabel ? getRefLabelColor(activeRefLabel) : null;
  const rowHasRef = (row: RowData) => activeRefLabel && row.node.refs?.includes(activeRefLabel);
  const rowDimmedByRef = (row: RowData) => !!activeRefLabel && !rowHasRef(row);
  const rowIndexById = new Map<string, number>();
  rows.forEach((r, i) => rowIndexById.set(r.node.id, i));

  const columnLines = columns.map((col) => {
    const x = getLaneX(col.index);
    const yPositions = rows
      .map((r, i) => (r.column === col.index ? i : -1))
      .filter((i) => i !== -1)
      .map((i) => nodeY(i));
    if (yPositions.length === 0) {
      return null;
    }
    const laneByCol =
      filterColumns.size > 0 && !filterColumns.has(col.index) && col.label !== hoveredBranch;
    const laneByRef = !!activeRefLabel && !rows.some((r) => r.column === col.index && rowHasRef(r));
    const laneDimmed =
      filterColumns.size > 0 && !!activeRefLabel ? laneByCol && laneByRef : laneByCol || laneByRef;
    return (
      <line
        key={`col-${col.index}`}
        x1={x}
        y1={yPositions[0]}
        x2={x}
        y2={yPositions[yPositions.length - 1]}
        stroke={col.color}
        strokeWidth={3}
        strokeLinecap="round"
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

    const edgeByCol =
      filterColumns.size > 0 &&
      !filterColumns.has(sourceRow.column) &&
      !filterColumns.has(targetRow.column) &&
      sourceRow.node.branch !== hoveredBranch &&
      targetRow.node.branch !== hoveredBranch;
    const edgeByRef = rowDimmedByRef(sourceRow) && rowDimmedByRef(targetRow);
    const edgeDimmed =
      filterColumns.size > 0 && !!activeRefLabel ? edgeByCol && edgeByRef : edgeByCol || edgeByRef;

    if (sourceRow.column === targetRow.column) {
      connections.push(
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
      connections.push(
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

  const nodes = rows.map((row, i) => {
    const x = getLaneX(row.column);
    const y = nodeY(i);
    const isHovered = hoveredId === row.node.id;
    const r = isHovered ? NODE_RADIUS * 1.2 : NODE_RADIUS;
    const byCol =
      filterColumns.size > 0 && !filterColumns.has(row.column) && row.node.branch !== hoveredBranch;
    const byRef = rowDimmedByRef(row);
    const nodeDimmed = filterColumns.size > 0 && !!activeRefLabel ? byCol && byRef : byCol || byRef;
    const nodeFill = !nodeDimmed && rowHasRef(row) && refLabelColor ? refLabelColor : row.color;
    if (row.node.tag) {
      return (
        <g key={`node-${row.node.id}`} opacity={nodeDimmed ? 0.1 : aheadRows.has(i) ? 0.65 : 1}>
          <circle cx={x} cy={y} r={r + 1} fill="none" stroke={nodeFill} strokeWidth={2.5} />
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
      const s = isHovered ? MERGE_NODE_SIZE * 1.2 : MERGE_NODE_SIZE;
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
          strokeWidth={2}
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
        strokeWidth={2}
        opacity={nodeDimmed ? 0.1 : aheadRows.has(i) ? 0.65 : 1}
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
  // Design spec for tag hover effects (Issue 1) and head annotation (Issue 2):
  // docs/superpowers/specs/2026-07-29-branch-graph-tag-hover-and-head-annotation-design.md
  const { t } = useTCopy();
  const locale = navigator.language || 'en-US';
  const theme = useBklitTheme();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [filterColumns, setFilterColumns] = useState(() => new Set<number>());
  const [activeRefLabel, setActiveRefLabel] = useState<string | null>(null);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const [collapsedDeletedLabels, setCollapsedDeletedLabels] = useState(true);

  const adapted = useMemo(() => (data ? adaptBranchGraphData(data) : null), [data]);
  // Debug: log branches from backend
  useEffect(() => {
    if (adapted) {
      console.log('[ADL-DEBUG] allBranches from backend:', adapted.allBranches);
    }
  }, [adapted]);
  const hasData = data != null;

  const tagRowRef = useRef<HTMLDivElement>(null);
  const scrollBodyRef = useRef<HTMLDivElement>(null);

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
    e.preventDefault();
    const absDx = Math.abs(e.deltaX);
    const absDy = Math.abs(e.deltaY);
    el.scrollLeft += absDx > absDy ? e.deltaX : e.deltaY;
  }, []);

  const isDark = theme.background !== '#ffffff';
  const { columnOf, columns, sortedIds } = useLaneAssignment(
    adapted?.nodes ?? [],
    adapted?.edges ?? [],
    isDark,
  );

  // Branch head detection: first occurrence of each branch in topological order = HEAD
  const branchHeads = useMemo(() => {
    const heads = new Set<string>();
    if (!adapted) {
      return heads;
    }
    const seenBranch = new Set<string>();
    for (const id of sortedIds) {
      const node = adapted.nodes.find((n) => n.id === id);
      if (!node || !node.branch) {
        continue;
      }
      if (!seenBranch.has(node.branch)) {
        seenBranch.add(node.branch);
        heads.add(id);
      }
    }
    return heads;
  }, [adapted, sortedIds]);

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
      if (!row.node.branch) {
        continue;
      }
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
      if (!arr) {
        arr = [];
        labelToCols.set(lbl, arr);
      }
      arr.push(c.index);
    }
    const freq = new Map<string, number>();
    const labeled: LabelColumnInfo[] = [];
    for (const c of columns) {
      const lbl = colLabel.get(c.index) ?? `#${c.index}`;
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
  // Debug: log label columns
  useEffect(() => {
    if (columnsWithLabels.length > 0) {
      console.log(
        '[ADL-DEBUG] label columns:',
        columnsWithLabels.map((c) => ({
          label: c.label,
          index: c.index,
          filterCols: c.filterCols,
        })),
      );
    }
  }, [columnsWithLabels]);

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

  const totalLaneWidth = columns.length * (LANE_WIDTH + LANE_GAP);
  const visibleRows = rows.slice(0, visibleCount);
  const totalHeight = visibleRows.length * ROW_HEIGHT + 8;
  const columnLabelMap = useMemo(
    () => new Map(columnsWithLabels.map((c) => [c.index, c.label ?? ''])),
    [columnsWithLabels],
  );

  const deletedSubBranches = useMemo(() => {
    const result: (MergedSubBranch & { color: string })[] = [];
    const seen = new Set<string>();
    const hashToId = new Map((adapted?.nodes ?? []).map((n) => [n.hash, n.id]));
    for (const row of rows) {
      const msbs = row.node.mergedSubBranches;
      if (!msbs) continue;
      for (const msb of msbs) {
        if (!msb.isDeleted || seen.has(msb.id)) continue;
        seen.add(msb.id);
        const parentNodeId = hashToId.get(msb.parentHash);
        const colInfo = parentNodeId ? columnOf.get(parentNodeId) : undefined;
        result.push({ ...msb, color: colInfo?.color ?? '#888' });
      }
    }
    return result;
  }, [rows, columnOf, adapted?.nodes]);

  const handleRowHover = useCallback((id: string | null) => setHoveredId(id), []);
  const handleLabelClick = useCallback((colIndices: number[]) => {
    setFilterColumns((prev) => {
      const anySelected = colIndices.some((i) => prev.has(i));
      const next = new Set(prev);
      for (const idx of colIndices) {
        if (anySelected) {
          next.delete(idx);
        } else {
          next.add(idx);
        }
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
      {/* Tag row — sticky top at chart level so it stays visible on scroll */}
      <div
        ref={tagRowRef}
        className="adl-branch-graph__tag-row--sticky"
        onWheel={handleTagRowWheel}
      >
        {columnsWithLabels.map((col) => {
          const fcs: number[] = col.filterCols ?? [col.index];
          const isSelected = fcs.some((i) => filterColumns.has(i));
          const isHovered = hoveredLabel === col.label;
          const showIndicator = isSelected || isHovered;
          const showScale = (isHovered && !isSelected) || (!isHovered && isSelected);
          return (
            <React.Fragment key={`col-${col.index}`}>
              <div className="adl-branch-graph__label-drag" style={{ opacity: 1 }}>
                <button
                  className="adl-branch-graph__label"
                  data-indicator={showIndicator ? 'true' : undefined}
                  data-scale={showScale ? 'true' : undefined}
                  onClick={() => handleLabelClick(fcs)}
                  onMouseEnter={() => setHoveredLabel(col.label ?? null)}
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
                    display: 'inline-flex',
                    alignItems: 'center',
                    lineHeight: 1,
                    opacity:
                      filterColumns.size === 0 || fcs.some((i) => filterColumns.has(i)) ? 1 : 0.4,
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
              {col.refsLabels &&
                renderRefLabels(
                  col.refsLabels,
                  activeRefLabel,
                  setActiveRefLabel,
                  hoveredLabel,
                  setHoveredLabel,
                  t,
                )}
            </React.Fragment>
          );
        })}
        {/* Deleted sub-branch labels — collapsible */}
        {deletedSubBranches.length > 0 && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginLeft: 8 }}>
            {collapsedDeletedLabels ? (
              <button
                className="adl-branch-graph__label"
                onClick={() => setCollapsedDeletedLabels(false)}
                style={{
                  padding: '2px 8px',
                  borderRadius: 0,
                  background: '#888',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  lineHeight: 1,
                  opacity: 0.7,
                }}
              >
                {deletedSubBranches.length} {t.gitVisMergeDeleted} ▸
              </button>
            ) : (
              <>
                {deletedSubBranches.map((dsb) => (
                  <div key={dsb.id} className="adl-branch-graph__label-drag" style={{ opacity: 0.7 }}>
                    <button
                      className="adl-branch-graph__label"
                      data-indicator={activeRefLabel === dsb.id ? 'true' : undefined}
                      onClick={() => setActiveRefLabel(activeRefLabel === dsb.id ? null : dsb.id)}
                      style={{
                        padding: '2px 8px',
                        borderRadius: 0,
                        background: dsb.color,
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        lineHeight: 1,
                      }}
                    >
                      {dsb.id}
                    </button>
                  </div>
                ))}
                <button
                  className="adl-branch-graph__label"
                  onClick={() => setCollapsedDeletedLabels(true)}
                  style={{
                    padding: '2px 4px',
                    borderRadius: 0,
                    background: 'transparent',
                    color: '#888',
                    fontSize: 11,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  ▾
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <div className="adl-branch-graph__body" ref={scrollBodyRef}>
        {/* Panels: lanes + table, same vertical scroll parent */}
        <div className="adl-branch-graph__panels">
          <div className="adl-branch-graph__lanes-panel">
            {/* Spacer matching table header height so SVG nodes align with rows */}
            <div className="adl-branch-graph__lanes-spacer" />
            <SvgLanes
              rows={visibleRows}
              columns={columns}
              edges={adapted?.edges ?? []}
              totalWidth={totalLaneWidth}
              totalHeight={totalHeight}
              hoveredId={hoveredId}
              nodeStroke={nodeStroke}
              filterColumns={filterColumns}
              hoveredBranch={hoveredLabel}
              aheadRows={aheadRows}
              activeRefLabel={activeRefLabel}
            />
          </div>
          <div className="adl-branch-graph__table-panel">
            {/* Header row — in table-panel so grid aligns with rows */}
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
                    <AuthorAvatar
                      name={row.node.author}
                      src={resolveAvatarUrl(row.node.authorEmail, 20)}
                      email={row.node.authorEmail}
                    />
                    {row.node.author}
                    {hoveredId === row.node.id && (
                      <TooltipSimple
                        content={
                          <CommitTooltipCard
                            hash={row.node.hash}
                            message={row.node.message}
                            author={row.node.author}
                            authorEmail={row.node.authorEmail}
                            date={row.node.date}
                            branch={row.node.branch}
                            refs={row.node.refs ?? []}
                            branchProgress={adapted?.branchProgress?.[row.node.branch]}
                            tag={row.node.tag}
                            isBranchHead={branchHeads.has(row.node.id)}
                            columnLabel={columnLabelMap.get(row.column)}
                            mergedSubBranches={row.node.mergedSubBranches}
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
                    )}
                  </span>
                  <span style={{ color: theme.muted }}>
                    {formatDate(row.node.date, locale, 'table')}
                  </span>
                </div>
              );
            })}
          </div>
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
