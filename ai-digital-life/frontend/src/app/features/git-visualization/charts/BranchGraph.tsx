import React, { useMemo, useState, useCallback } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useBklitTheme } from '../hooks/useBklitTheme';
import { commitNodes, commitEdges, allBranches } from '../data/gitVisMockData';

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

function assignLanes(isDark: boolean): LaneMap[] {
  return allBranches.map((branch, i) => ({
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
}

const SvgLanes = React.memo(function SvgLanes({
  rows,
  lanes,
  totalWidth,
  totalHeight,
  hoveredId,
  nodeStroke,
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
        opacity={0.5}
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
        />
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
          opacity={0.6}
        />
      );
    }
  }

  const nodes = rows.map((row, i) => {
    const x = getLaneX(row.lane.index);
    const y = nodeY(i);
    const isHovered = hoveredId === row.node.id;
    const r = isHovered ? NODE_RADIUS * 1.2 : NODE_RADIUS;

    if (row.node.tag) {
      return (
        <g key={`node-${row.node.id}`}>
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
      const s = MERGE_NODE_SIZE;
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
  const [filterBranch, setFilterBranch] = useState<string | null>(null);

  const isDark = theme.background !== '#ffffff';
  const lanes = useMemo(() => assignLanes(isDark), [isDark]);
  const parentMap = useMemo(() => computeParentMap(), []);
  const rows = useMemo(() => buildRows(lanes, parentMap), [lanes, parentMap]);

  const totalLaneWidth = lanes.length * (LANE_WIDTH + LANE_GAP);
  const totalHeight = rows.length * ROW_HEIGHT + 8;

  const handleRowHover = useCallback((id: string | null) => setHoveredId(id), []);
  const handleLabelClick = useCallback((branch: string) => {
    setFilterBranch((prev) => (prev === branch ? null : branch));
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
        <div style={{ display: 'flex', gap: 6, padding: '4px 8px 8px', flexWrap: 'wrap' }}>
          {lanes.map((l) => (
            <button
              key={l.branch}
              className={
                filterBranch === null
                  ? 'adl-branch-graph__label'
                  : filterBranch === l.branch
                    ? 'adl-branch-graph__label adl-branch-graph__label--active'
                    : 'adl-branch-graph__label adl-branch-graph__label--inactive'
              }
              onClick={() => handleLabelClick(l.branch)}
              style={{
                padding: '2px 8px',
                borderRadius: 4,
                background: l.color,
                color: '#fff',
                fontSize: 11,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                opacity: filterBranch === null || filterBranch === l.branch ? 1 : 0.4,
              }}
              title={t.gitVisBranchGraphFilterHint}
            >
              {l.branch}
            </button>
          ))}
        </div>

        <div />
        <div
          className="adl-branch-graph__header"
          style={{
            display: 'grid',
            gridTemplateColumns: '80px 1fr auto auto',
            gap: 4,
            padding: '4px 8px',
            fontSize: 11,
            fontWeight: 600,
            color: theme.muted,
            borderBottom: `1px solid ${theme.grid}`,
          }}
        >
          <span>HASH</span>
          <span>MESSAGE</span>
          <span>AUTHOR</span>
          <span>DATE</span>
        </div>

        <SvgLanes
          rows={rows}
          lanes={lanes}
          totalWidth={totalLaneWidth}
          totalHeight={totalHeight}
          hoveredId={hoveredId}
          nodeStroke={nodeStroke}
        />
        <div>
          {rows.map((row) => {
            const isFiltered = filterBranch !== null && filterBranch !== row.node.branch;
            return (
              <div
                key={row.node.id}
                className={`adl-branch-graph__row${hoveredId === row.node.id ? ' adl-branch-graph__row--hover' : ''}${isFiltered ? ' adl-branch-graph__row--dimmed' : ''}`}
                data-branch={row.node.branch}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '80px 1fr auto auto',
                  gap: 4,
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
                        padding: '1px 6px',
                        borderRadius: 3,
                        background: row.lane.color,
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      {row.node.tag}
                    </span>
                  )}
                </span>
                <span style={{ color: theme.muted }}>{row.node.author}</span>
                <span style={{ color: theme.muted, textAlign: 'right' }}>
                  {formatRelativeDate(row.node.date)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

function formatRelativeDate(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 1) {
    return 'today';
  }
  if (diffDays === 1) {
    return '1d ago';
  }
  if (diffDays < 30) {
    return `${diffDays}d ago`;
  }
  if (diffDays < 365) {
    return `${Math.floor(diffDays / 30)}mo ago`;
  }
  return `${Math.floor(diffDays / 365)}y ago`;
}
