import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useBklitTheme } from '../hooks/useBklitTheme';
import { commitNodes, commitEdges, allBranches } from '../data/gitVisMockData';
import { createPortal } from 'react-dom';
import { useBranchLabelDragReorder } from '../hooks/useBranchLabelDragReorder';

// ── Constants ──
const LANE_WIDTH = 24;
const LANE_GAP = 8;
const ROW_HEIGHT = 36;
const NODE_RADIUS = 6;
const MERGE_NODE_SIZE = 12;

// ── Theme-aware branch colors ──
const BRANCH_COLORS_LIGHT: Record<string, string> = {
  main: '#3b82f6',
  'feature-1': '#10b981',
  'feature-2': '#f59e0b',
  'feature-3': '#8b5cf6',
  'feature-4': '#ec4899',
  'release/v1.0': '#06b6d4',
  hotfix: '#ef4444',
};

const BRANCH_COLORS_DARK: Record<string, string> = {
  main: '#60a5fa',
  'feature-1': '#34d399',
  'feature-2': '#fbbf24',
  'feature-3': '#a78bfa',
  'feature-4': '#f472b6',
  'release/v1.0': '#22d3ee',
  hotfix: '#f87171',
};

// ── Author Avatar ──
// 当前为模拟数据阶段：使用首字母圆形头像，颜色由作者名哈希决定。
// TODO-FUTURE: 接入真实用户头像（GitHub / Gravatar）
//   集成点：AuthorAvatarProps.src —— 传入头像 URL 后自动渲染图片并裁剪为圆形。
//           数据源 CommitNode 可扩展 avatarUrl 字段，从 git log 或用户配置获取。

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
  /** Future: 真实头像 URL（GitHub / Gravatar），传入后替代首字母显示 */
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
interface LaneMap {
  branch: string;
  index: number;
  color: string;
}

interface RowData {
  node: (typeof commitNodes)[0];
  lane: LaneMap;
  parents: string[];
  isMerge: boolean;
}

function assignLanes(branches: string[], isDark: boolean): LaneMap[] {
  return branches.map((branch, i) => ({
    branch,
    index: i,
    color: (isDark ? BRANCH_COLORS_DARK : BRANCH_COLORS_LIGHT)[branch] || '#94a3b8',
  }));
}

function computeParentMap(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const edge of commitEdges) {
    const existing = map.get(edge.source) || [];
    existing.push(edge.target);
    map.set(edge.source, existing);
  }
  return map;
}

function getLaneX(laneIndex: number): number {
  return laneIndex * (LANE_WIDTH + LANE_GAP) + LANE_WIDTH / 2;
}

function buildRows(lanes: LaneMap[], parentMap: Map<string, string[]>): RowData[] {
  const laneIndexByBranch = new Map(lanes.map((l) => [l.branch, l.index]));
  const commitById = new Map(commitNodes.map((n) => [n.id, n]));

  const visited = new Set<string>();
  const sorted: string[] = [];

  function visit(id: string) {
    if (visited.has(id)) {
      return;
    }
    visited.add(id);
    const parents = parentMap.get(id) || [];
    for (const p of parents) {
      visit(p);
    }
    sorted.push(id);
  }

  for (const node of commitNodes) {
    visit(node.id);
  }

  return sorted.map((id) => {
    const node = commitById.get(id)!;
    const parents = parentMap.get(id) || [];
    const laneIdx = laneIndexByBranch.get(node.branch) ?? 0;
    return {
      node,
      lane: lanes[laneIdx],
      parents,
      isMerge: parents.length >= 2,
    };
  });
}

// ── Sub-components ──

interface SvgLanesProps {
  rows: RowData[];
  lanes: LaneMap[];
  totalWidth: number;
  totalHeight: number;
  hoveredId: string | null;
  nodeStroke: string;
  filterBranches: Set<string>;
  hoveredBranch: string | null;
}

const SvgLanes = React.memo(function SvgLanes({
  rows,
  lanes,
  totalWidth,
  totalHeight,
  hoveredId,
  nodeStroke,
  filterBranches,
  hoveredBranch,
}: SvgLanesProps) {
  const nodeY = (rowIndex: number) => rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

  const rowIndexById = new Map<string, number>();
  rows.forEach((r, i) => rowIndexById.set(r.node.id, i));

  const laneLines = lanes.map((l) => {
    const x = getLaneX(l.index);
    const yPositions = rows
      .map((r, i) => (r.node.branch === l.branch ? i : -1))
      .filter((i) => i !== -1)
      .map((i) => nodeY(i));
    if (yPositions.length === 0) {
      return null;
    }
    const laneDimmed =
      filterBranches.size > 0 && !filterBranches.has(l.branch) && l.branch !== hoveredBranch;
    return (
      <line
        key={`lane-${l.branch}`}
        x1={x}
        y1={yPositions[0]}
        x2={x}
        y2={yPositions[yPositions.length - 1]}
        stroke={l.color}
        strokeWidth={3}
        strokeLinecap="round"
        opacity={laneDimmed ? 0.1 : 0.5}
      />
    );
  });

  const connections: React.ReactElement[] = [];
  for (const edge of commitEdges) {
    const sourceIdx = rowIndexById.get(edge.source);
    const targetIdx = rowIndexById.get(edge.target);
    if (sourceIdx === undefined || targetIdx === undefined) {
      continue;
    }
    const sourceRow = rows[sourceIdx];
    const targetRow = rows[targetIdx];
    const sx = getLaneX(sourceRow.lane.index);
    const sy = nodeY(sourceIdx);
    const tx = getLaneX(targetRow.lane.index);
    const ty = nodeY(targetIdx);

    const edgeDimmed =
      filterBranches.size > 0 &&
      !filterBranches.has(sourceRow.node.branch) &&
      !filterBranches.has(targetRow.node.branch) &&
      sourceRow.node.branch !== hoveredBranch &&
      targetRow.node.branch !== hoveredBranch;

    if (sourceRow.lane.index === targetRow.lane.index) {
      connections.push(
        <line
          key={`edge-${edge.source}-${edge.target}`}
          x1={sx}
          y1={sy}
          x2={tx}
          y2={ty}
          stroke={sourceRow.lane.color}
          strokeWidth={2.5}
          strokeLinecap="round"
          opacity={edgeDimmed ? 0.1 : 1}
        />,
      );
    } else {
      const midY = (sy + ty) / 2;
      connections.push(
        <path
          key={`edge-${edge.source}-${edge.target}`}
          d={`M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`}
          fill="none"
          stroke={sourceRow.lane.color}
          strokeWidth={2}
          strokeDasharray={sourceIdx > targetIdx ? '4,3' : 'none'}
          opacity={edgeDimmed ? 0.1 : 0.6}
        />,
      );
    }
  }

  const nodes = rows.map((row, i) => {
    const x = getLaneX(row.lane.index);
    const y = nodeY(i);
    const isHovered = hoveredId === row.node.id;
    const r = isHovered ? NODE_RADIUS * 1.2 : NODE_RADIUS;
    const nodeDimmed =
      filterBranches.size > 0 &&
      !filterBranches.has(row.node.branch) &&
      row.node.branch !== hoveredBranch;

    if (row.node.tag) {
      return (
        <g key={`node-${row.node.id}`} opacity={nodeDimmed ? 0.1 : 1}>
          <circle cx={x} cy={y} r={r + 1} fill="none" stroke={row.lane.color} strokeWidth={2.5} />
          <circle cx={x + 14} cy={y - 8} r={8} fill={row.lane.color} opacity={0.15} />
          <text
            x={x + 14}
            y={y - 5}
            textAnchor="middle"
            fontSize={8}
            fill={row.lane.color}
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
          fill={row.lane.color}
          stroke={nodeStroke}
          strokeWidth={2}
          opacity={nodeDimmed ? 0.1 : 1}
        />
      );
    }

    return (
      <circle
        key={`node-${row.node.id}`}
        cx={x}
        cy={y}
        r={r}
        fill={row.lane.color}
        stroke={nodeStroke}
        strokeWidth={2}
        opacity={nodeDimmed ? 0.1 : 1}
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
      {laneLines}
      {connections}
      {nodes}
    </svg>
  );
});

// ── Main component ──

export const BranchGraph = React.memo(function BranchGraph() {
  const { t } = useTCopy();
  const theme = useBklitTheme();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [filterBranches, setFilterBranches] = useState(() => new Set<string>());
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const {
    isDragging,
    draggedBranchId,
    previewOrder,
    cursorPosition,
    ghostLabel,
    handleMouseDown: handleBranchMouseDown,
  } = useBranchLabelDragReorder(allBranches, () => {});
  const tagRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = tagRowRef.current;
    if (!el) {
      return;
    }
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const isDark = theme.background !== '#ffffff';
  const lanes = useMemo(() => assignLanes(previewOrder, isDark), [previewOrder, isDark]);
  const parentMap = useMemo(() => computeParentMap(), []);
  const rows = useMemo(() => buildRows(lanes, parentMap), [lanes, parentMap]);

  const totalLaneWidth = lanes.length * (LANE_WIDTH + LANE_GAP);
  const totalHeight = rows.length * ROW_HEIGHT + 8;

  const handleRowHover = useCallback((id: string | null) => setHoveredId(id), []);
  const handleLabelClick = useCallback((branch: string) => {
    setFilterBranches((prev) => {
      const next = new Set(prev);
      if (next.has(branch)) {
        next.delete(branch);
      } else {
        next.add(branch);
      }
      return next;
    });
  }, []);

  const nodeStroke = isDark ? '#1a1a1a' : '#ffffff';

  return (
    <div className="adl-git-vis__chart">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${totalLaneWidth + 4}px 1fr`,
          gap: 4,
        }}
      >
        <div />
        <div ref={tagRowRef} className="adl-branch-graph__tag-row">
          {lanes.map((l) => {
            const isSelected = filterBranches.has(l.branch);
            const isHovered = hoveredLabel === l.branch;
            const showIndicator = isSelected || isHovered;
            const showScale = (isHovered && !isSelected) || (!isHovered && isSelected);
            const isDragBranch = draggedBranchId === l.branch;
            return (
              <div
                key={l.branch}
                className="adl-branch-graph__label-drag"
                data-branch-drag-id={l.branch}
                style={{
                  opacity: isDragBranch ? 0.4 : 1,
                }}
                onMouseDown={handleBranchMouseDown(l.branch)}
              >
                <button
                  className="adl-branch-graph__label"
                  data-indicator={showIndicator ? 'true' : undefined}
                  data-scale={showScale ? 'true' : undefined}
                  onClick={() => handleLabelClick(l.branch)}
                  onMouseEnter={() => setHoveredLabel(l.branch)}
                  onMouseLeave={() => setHoveredLabel(null)}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 0,
                    background: l.color,
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    opacity: filterBranches.size === 0 || filterBranches.has(l.branch) ? 1 : 0.4,
                  }}
                >
                  <span className="adl-branch-graph__label-text">{l.branch}</span>
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
          rows={rows}
          lanes={lanes}
          totalWidth={totalLaneWidth}
          totalHeight={totalHeight}
          hoveredId={hoveredId}
          nodeStroke={nodeStroke}
          filterBranches={filterBranches}
          hoveredBranch={hoveredLabel}
        />
        <div>
          {rows.map((row) => {
            const isFiltered =
              filterBranches.size > 0 &&
              !filterBranches.has(row.node.branch) &&
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
                    fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                    color: theme.text,
                    fontSize: 11,
                  }}
                >
                  {row.node.hash}
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
                        background: row.lane.color,
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
        </div>
      </div>

      {isDragging &&
        ghostLabel &&
        createPortal(
          <div
            aria-hidden="true"
            style={{
              position: 'fixed',
              top: cursorPosition.y,
              left: cursorPosition.x,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              zIndex: 9999,
              padding: '2px 8px',
              background:
                (isDark ? BRANCH_COLORS_DARK : BRANCH_COLORS_LIGHT)[ghostLabel] || '#94a3b8',
              color: '#fff',
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            {ghostLabel}
          </div>,
          document.body,
        )}
    </div>
  );
});

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
