import type { HeatmapColumn, HeatmapBin } from '@/components/charts/heatmap/heatmap-context';
import type { BklitAreaRow } from '../../../../test-fixtures/gitVisMockData';
import type { CommitNode, CommitEdge } from '../../../../test-fixtures/gitVisMockData';

export interface RawCommitStats {
  dailyCommits: { date: string; count: number }[];
  hourlyDistribution: { day: number; hour: number; count: number }[];
  contributorActivity: {
    author: string;
    authorEmail: string;
    totalCommits: number;
    periods: { period: string; count: number }[];
  }[];
  commitTimeline: { date: string; cumulative: number }[];
}

export interface RawBranchGraph {
  nodes: {
    hash: string;
    shortHash: string;
    parentHashes: string[];
    branch: string;
    date: string;
    message: string;
    author: string;
    authorEmail: string;
    tag?: string;
  }[];
  edges: { from: string; to: string }[];
  branches: string[];
}

export interface RawContributorModules {
  matrix: {
    author: string;
    authorEmail: string;
    modules: { module: string; count: number }[];
  }[];
}

export function commitStatsToHeatmapColumns(
  dailyCommits: RawCommitStats['dailyCommits'],
): HeatmapColumn[] {
  const weekMap = new Map<number, { count: number; bin: number; date: Date }[]>();
  for (const { date, count } of dailyCommits) {
    const d = new Date(date);
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
    if (!weekMap.has(weekNum)) {
      weekMap.set(weekNum, []);
    }
    weekMap.get(weekNum)!.push({ count, bin: d.getDay(), date: d });
  }
  return [...weekMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([weekNum, bins]) => {
      const existingDays = new Set(bins.map((b) => b.bin));
      const allBins: HeatmapBin[] = [];
      const weekDate = new Date(bins[0].date);
      weekDate.setDate(weekDate.getDate() - bins[0].bin);
      for (let day = 0; day < 7; day++) {
        if (existingDays.has(day)) {
          allBins.push(bins.find((b) => b.bin === day)!);
        } else {
          const d = new Date(weekDate);
          d.setDate(d.getDate() + day);
          allBins.push({ count: 0, bin: day, date: d });
        }
      }
      return { bin: weekNum, bins: allBins };
    });
}

export function hourlyDistributionToHeatmapColumns(
  hourlyDistribution: RawCommitStats['hourlyDistribution'],
): HeatmapColumn[] {
  const hourMap = new Map<number, HeatmapBin[]>();
  for (const { day, hour, count } of hourlyDistribution) {
    if (!hourMap.has(hour)) {
      hourMap.set(hour, []);
    }
    hourMap.get(hour)!.push({ count, bin: day });
  }
  return [...hourMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, bins]) => ({ bin: hour, bins, columnLabel: String(hour) }));
}

export function contributorActivityToHeatmapColumns(
  contributorActivity: RawCommitStats['contributorActivity'],
): { columns: HeatmapColumn[]; rowLabels: string[] } {
  const rowLabels = contributorActivity.map((c) => c.author);
  const allPeriods = new Set<string>();
  for (const c of contributorActivity) {
    for (const p of c.periods) {
      allPeriods.add(p.period);
    }
  }
  const sortedPeriods = [...allPeriods].sort();
  const columns: HeatmapColumn[] = sortedPeriods.map((period, colIdx) => ({
    bin: colIdx,
    columnLabel: period,
    bins: contributorActivity.map((c, rowIdx) => ({
      count: c.periods.find((p) => p.period === period)?.count || 0,
      bin: rowIdx,
    })),
  }));
  return { columns, rowLabels };
}

export function contributorModulesToHeatmapColumns(matrix: RawContributorModules['matrix']): {
  columns: HeatmapColumn[];
  rowLabels: string[];
} {
  const rowLabels = matrix.map((m) => m.author);
  const allModules = new Set<string>();
  for (const m of matrix) {
    for (const mod of m.modules) {
      allModules.add(mod.module);
    }
  }
  const sortedModules = [...allModules].sort();
  const columns: HeatmapColumn[] = sortedModules.map((module, colIdx) => ({
    bin: colIdx,
    columnLabel: module,
    bins: matrix.map((m, rowIdx) => ({
      count: m.modules.find((mod) => mod.module === module)?.count || 0,
      bin: rowIdx,
    })),
  }));
  return { columns, rowLabels };
}

export function codeEvolutionToAreaData(
  weeks: { weekStart: string; additions: number; deletions: number }[],
): BklitAreaRow[] {
  return weeks.map((w) => ({
    date: w.weekStart.substring(5),
    added: w.additions,
    deleted: w.deletions,
  }));
}

export function commitTimelineToRows(
  timeline: { date: string; cumulative: number }[],
): { date: string; count: number; cumulative: number }[] {
  let prev = 0;
  return timeline.map((t) => {
    const count = t.cumulative - prev;
    prev = t.cumulative;
    return { date: t.date, count, cumulative: t.cumulative };
  });
}

export function adaptBranchGraphData(raw: RawBranchGraph): {
  nodes: CommitNode[];
  edges: CommitEdge[];
  allBranches: string[];
} {
  const nodes = raw.nodes.map((n, i) => ({
    id: `node-${i}`,
    hash: n.hash,
    branch: n.branch,
    date: n.date,
    message: n.message,
    author: n.author,
    authorEmail: n.authorEmail,
    tag: n.tag,
  }));
  const hashToId = new Map(nodes.map((n) => [n.hash, n.id]));
  return {
    nodes,
    edges: raw.edges.map((e) => ({
      source: hashToId.get(e.from) || e.from,
      target: hashToId.get(e.to) || e.to,
    })),
    allBranches: raw.branches,
  };
}

export function adaptSunburstData(tree: unknown): unknown {
  return tree;
}
