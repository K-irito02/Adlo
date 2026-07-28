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
    periods: { period: string; month: number; count: number }[];
  }[];
  commitTimeline: { date: string; cumulative: number }[];
}

export interface RawBranchGraph {
  nodes: {
    hash: string;
    shortHash?: string;
    parentHashes: string[];
    branch: string;
    refs?: string[];
    date: string;
    message: string;
    author: string;
    authorEmail: string;
    tag?: string;
  }[];
  edges: { from: string; to: string }[];
  branches: string[];
  branchProgress?: Record<string, { ahead: number; behind: number; mergeBase?: string }>;
}

export interface RawContributorModules {
  matrix: {
    author: string;
    authorEmail: string;
    modules: { module: string; count: number }[];
  }[];
  allPaths?: string[];
}

/** Maps JS Date.getDay() (0=Sun..6=Sat) to row index where top row = Sunday */
export function dayBinToRow(bin: number): number {
  return bin;
}

export function commitStatsToHeatmapColumns(
  dailyCommits: RawCommitStats['dailyCommits'],
): HeatmapColumn[] {
  const weekMap = new Map<number, { count: number; bin: number; date: Date }[]>();
  for (const { date, count } of dailyCommits) {
    const d = new Date(date + 'T00:00:00'); // 'YYYY-MM-DD' alone is parsed as UTC per spec; +'T00:00:00' forces local-timezone parsing so getDay()/getFullYear() match the calendar date
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
    if (!weekMap.has(weekNum)) {
      weekMap.set(weekNum, []);
    }
    weekMap.get(weekNum)!.push({ count, bin: d.getDay(), date: d });
  }
  const result = [...weekMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([weekNum, bins]) => {
      const existingDays = new Set(bins.map((b) => b.bin));
      const allBins: HeatmapBin[] = [];
      const weekDate = new Date(bins[0].date);
      weekDate.setDate(weekDate.getDate() - bins[0].bin);
      for (let row = 0; row < 7; row++) {
        const getDayVal = dayBinToRow(row);
        if (existingDays.has(getDayVal)) {
          const existing = bins.find((b) => b.bin === getDayVal);
          if (existing) {
            allBins.push({ ...existing, bin: row });
          }
        } else {
          const d = new Date(weekDate);
          d.setDate(d.getDate() + getDayVal);
          allBins.push({ count: 0, bin: row, date: d });
        }
      }
      return { bin: weekNum, bins: allBins };
    });
  return result;
}

export function hourlyDistributionToHeatmapColumns(
  hourlyDistribution: RawCommitStats['hourlyDistribution'],
  dayNames?: string[],
): HeatmapColumn[] {
  const hourMap = new Map<number, HeatmapBin[]>();
  for (const { day, hour, count } of hourlyDistribution) {
    if (!hourMap.has(hour)) {
      hourMap.set(hour, []);
    }
    const row = dayBinToRow(day);
    const subtitle = dayNames ? dayNames[row] : undefined;
    hourMap.get(hour)!.push({ count, bin: row, tooltipSubtitle: subtitle });
  }
  return [...hourMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, bins]) => ({ bin: hour, bins, columnLabel: String(hour) }));
}

export function contributorActivityToHeatmapColumns(
  contributorActivity: RawCommitStats['contributorActivity'],
  since?: string,
  until?: string,
): { columns: HeatmapColumn[]; rowLabels: string[] } {
  const sorted = [...contributorActivity].sort((a, b) => a.author.localeCompare(b.author));
  const rowLabels = sorted.map((c) => c.author);

  // Build a map: period -> array of counts per author
  const periodSet = new Set<string>();
  const dataByAuthor = sorted.map((c) => {
    const periodMap = new Map<string, number>();
    for (const p of c.periods) {
      periodMap.set(p.period, p.count);
      periodSet.add(p.period);
    }
    return periodMap;
  });

  // Derive full month range
  const sortedPeriods = [...periodSet].sort();
  const minPeriod = since ? since.substring(0, 7) : sortedPeriods[0];
  const maxPeriod = until ? until.substring(0, 7) : sortedPeriods[sortedPeriods.length - 1];
  if (!minPeriod || !maxPeriod) {
    return { columns: [], rowLabels };
  }

  const periods = generateMonthRange(minPeriod, maxPeriod);

  const columns: HeatmapColumn[] = periods.map((period, colIdx) => {
    const [yearStr, monthStr] = period.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const date = new Date(year, month - 1, 1);

    return {
      bin: colIdx,
      bins: sorted.map((c, rowIdx) => ({
        count: dataByAuthor[rowIdx].get(period) ?? 0,
        bin: rowIdx,
        date,
        tooltipTitle: new Intl.DateTimeFormat('default', { year: 'numeric', month: 'long' }).format(
          date,
        ),
        tooltipSubtitle: c.author,
      })),
    };
  });

  return { columns, rowLabels };
}

function generateMonthRange(from: string, to: string): string[] {
  const [y1, m1] = from.split('-').map(Number);
  const [y2, m2] = to.split('-').map(Number);
  const result: string[] = [];
  let y = y1,
    m = m1;
  while (y < y2 || (y === y2 && m <= m2)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return result;
}

export function contributorModulesToHeatmapColumns(matrix: RawContributorModules['matrix']): {
  columns: HeatmapColumn[];
  rowLabels: string[];
} {
  const sorted = [...matrix].sort((a, b) => a.author.localeCompare(b.author));
  const rowLabels = sorted.map((m) => m.author);
  const allModules = new Set<string>();
  for (const m of sorted) {
    for (const mod of m.modules) {
      allModules.add(mod.module);
    }
  }
  const sortedModules = [...allModules].sort();
  const columns: HeatmapColumn[] = sortedModules.map((module, colIdx) => ({
    bin: colIdx,
    columnLabel: module,
    bins: sorted.map((m, rowIdx) => ({
      count: m.modules.find((mod) => mod.module === module)?.count || 0,
      bin: rowIdx,
      tooltipTitle: module,
      tooltipSubtitle: m.author,
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
  branchProgress?: Record<string, { ahead: number; behind: number; mergeBase?: string }>;
} {
  const nodes = raw.nodes.map((n, i) => ({
    id: `node-${i}`,
    hash: n.hash,
    shortHash: n.shortHash ?? n.hash.substring(0, 7),
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
    branchProgress: raw.branchProgress,
  };
}

export function adaptSunburstData(tree: unknown): unknown {
  return tree;
}
