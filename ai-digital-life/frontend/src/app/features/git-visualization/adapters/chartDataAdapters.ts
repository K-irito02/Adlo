import type { HeatmapColumn, HeatmapBin } from '@/components/charts/heatmap/heatmap-context';
import type { SunburstNode } from '@/components/charts/sunburst-chart';
import type { CommitNode, CommitEdge } from '../types/gitGraph';

export type Granularity = 'day' | 'week' | 'month';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- object shape must stay a `type` so it remains assignable to Record<string, unknown>[] for the chart pipeline
export type CodeEvolutionRow = {
  date: string;
  added: number;
  deletedNeg: number;
  net: number;
};

export function resolveGranularity(start: Date, end: Date): Granularity {
  const days = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
  if (days <= 45) {
    return 'day';
  }
  if (days <= 180) {
    return 'week';
  }
  return 'month';
}

export function commitCountLabelFor(
  granularity: Granularity,
  labels: { day: string; week: string; month: string },
): string {
  if (granularity === 'day') {
    return labels.day;
  }
  if (granularity === 'month') {
    return labels.month;
  }
  return labels.week;
}

/** Granularity-aware x-axis tick label formatter (YYYY-MM for month, M/D otherwise). */
export function dateLabelFormatterFor(granularity: Granularity): (d: Date) => string {
  return DATE_LABEL_FORMATTERS[granularity];
}

const DATE_LABEL_FORMATTERS: Record<Granularity, (d: Date) => string> = {
  day: (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
  week: (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
  month: (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
};

function toDate10(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function mondayOf(date10: string): string {
  const d = new Date(date10 + 'T00:00:00Z');
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const mondayOffset = (dow + 6) % 7;
  return toDate10(addDays(d, -mondayOffset));
}

function monthOf(date10: string): string {
  return date10.slice(0, 7); // YYYY-MM
}

/**
 * Inclusive end of the aggregation period containing `date` for the given
 * granularity. Used to keep the last partial period (e.g. the final week whose
 * Monday is before the last data day) inside the visible range so its data is
 * not filtered out while the period still displays under its start date.
 */
export function periodEndInclusive(date: Date, granularity: Granularity): Date {
  if (granularity === 'day') {
    return date;
  }
  if (granularity === 'week') {
    // End of the week containing `date` (Sunday), regardless of which weekday
    // the selection ends on — `date + 6` alone would only be the week's Sunday
    // when `date` is a Monday and would otherwise pull the next week in.
    return addDays(new Date(mondayOf(toDate10(date)) + 'T00:00:00Z'), 6);
  }
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)); // last day of the month
}

export function aggregateCodeEvolutionDays(
  days: { date: string; additions: number; deletions: number }[],
  granularity: Granularity,
): CodeEvolutionRow[] {
  if (granularity === 'day') {
    if (days.length === 0) {
      return [];
    }
    const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
    const byDate = new Map(sorted.map((d) => [d.date, d]));
    const result: CodeEvolutionRow[] = [];
    const endExclusive = addDays(new Date(sorted[sorted.length - 1].date + 'T00:00:00Z'), 1);
    for (
      let cur = new Date(sorted[0].date + 'T00:00:00Z');
      cur.getTime() < endExclusive.getTime();
      cur = addDays(cur, 1)
    ) {
      const date10 = toDate10(cur);
      const d = byDate.get(date10);
      result.push(
        d
          ? {
              date: date10,
              added: d.additions,
              deletedNeg: -d.deletions,
              net: d.additions - d.deletions,
            }
          : { date: date10, added: 0, deletedNeg: 0, net: 0 },
      );
    }
    return result;
  }

  const key = granularity === 'week' ? mondayOf : monthOf;
  const buckets = new Map<string, { add: number; del: number }>();
  for (const d of days) {
    const k = key(d.date);
    const b = buckets.get(k) ?? { add: 0, del: 0 };
    b.add += d.additions;
    b.del += d.deletions;
    buckets.set(k, b);
  }
  const keys = [...buckets.keys()].sort();
  if (keys.length === 0) {
    return [];
  }
  const result: CodeEvolutionRow[] = [];
  const pushBucket = (date10: string) => {
    const b = buckets.get(date10);
    result.push(
      b
        ? { date: date10, added: b.add, deletedNeg: -b.del, net: b.add - b.del }
        : { date: date10, added: 0, deletedNeg: 0, net: 0 },
    );
  };
  if (granularity === 'week') {
    const endExclusive = addDays(new Date(keys[keys.length - 1] + 'T00:00:00Z'), 7);
    for (
      let cur = new Date(keys[0] + 'T00:00:00Z');
      cur.getTime() < endExclusive.getTime();
      cur = addDays(cur, 7)
    ) {
      pushBucket(toDate10(cur));
    }
    return result;
  }
  const [y1, m1] = keys[0].split('-').map(Number);
  const [y2, m2] = keys[keys.length - 1].split('-').map(Number);
  let y = y1;
  let m = m1;
  while (y < y2 || (y === y2 && m <= m2)) {
    const monthDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const b = buckets.get(monthDate.slice(0, 7));
    result.push(
      b
        ? { date: monthDate, added: b.add, deletedNeg: -b.del, net: b.add - b.del }
        : { date: monthDate, added: 0, deletedNeg: 0, net: 0 },
    );
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return result;
}

export function aggregateCommitTimeline(
  timeline: { date: string; count: number; cumulative: number }[],
  granularity: Granularity,
): { date: string; count: number; cumulative: number }[] {
  if (granularity === 'day') {
    if (timeline.length === 0) {
      return [];
    }
    const sorted = [...timeline].sort((a, b) => (a.date < b.date ? -1 : 1));
    const byDate = new Map(sorted.map((t) => [t.date, t]));
    const result: { date: string; count: number; cumulative: number }[] = [];
    let prevCumulative = 0;
    const endExclusive = addDays(new Date(sorted[sorted.length - 1].date + 'T00:00:00Z'), 1);
    for (
      let cur = new Date(sorted[0].date + 'T00:00:00Z');
      cur.getTime() < endExclusive.getTime();
      cur = addDays(cur, 1)
    ) {
      const date10 = toDate10(cur);
      const t = byDate.get(date10);
      if (t) {
        prevCumulative = t.cumulative;
        result.push({ date: date10, count: t.count, cumulative: t.cumulative });
      } else {
        result.push({ date: date10, count: 0, cumulative: prevCumulative });
      }
    }
    return result;
  }

  const key = granularity === 'week' ? mondayOf : monthOf;
  const buckets = new Map<string, { count: number; cumulative: number }>();
  for (const t of timeline) {
    const k = key(t.date);
    const prev = buckets.get(k);
    if (!prev) {
      buckets.set(k, { count: t.count, cumulative: t.cumulative });
    } else {
      prev.count += t.count;
      prev.cumulative = t.cumulative; // 取该桶末尾日累计
    }
  }
  const keys = [...buckets.keys()].sort();
  if (keys.length === 0) {
    return [];
  }
  const result: { date: string; count: number; cumulative: number }[] = [];
  let prevCumulative = 0;
  const pushBucket = (date10: string) => {
    const v = buckets.get(date10);
    if (v) {
      prevCumulative = v.cumulative;
      result.push({ date: date10, count: v.count, cumulative: v.cumulative });
    } else {
      result.push({ date: date10, count: 0, cumulative: prevCumulative });
    }
  };
  if (granularity === 'week') {
    const endExclusive = addDays(new Date(keys[keys.length - 1] + 'T00:00:00Z'), 7);
    for (
      let cur = new Date(keys[0] + 'T00:00:00Z');
      cur.getTime() < endExclusive.getTime();
      cur = addDays(cur, 7)
    ) {
      pushBucket(toDate10(cur));
    }
    return result;
  }
  const [y1, m1] = keys[0].split('-').map(Number);
  const [y2, m2] = keys[keys.length - 1].split('-').map(Number);
  let y = y1;
  let m = m1;
  while (y < y2 || (y === y2 && m <= m2)) {
    const monthDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const v = buckets.get(monthDate.slice(0, 7));
    if (v) {
      prevCumulative = v.cumulative;
      result.push({ date: monthDate, count: v.count, cumulative: v.cumulative });
    } else {
      result.push({ date: monthDate, count: 0, cumulative: prevCumulative });
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return result;
}

export interface RawCommitStats {
  dailyCommits: { date: string; count: number }[];
  hourlyDistribution: { day: number; hour: number; count: number }[];
  contributorActivity: {
    author: string;
    authorEmail: string;
    totalCommits: number;
    periods: { period: string; month: number; count: number }[];
  }[];
  commitTimeline: { date: string; count: number; cumulative: number }[];
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
    refs: n.refs,
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

interface GitVisSunburstNodeInput {
  name: string;
  type?: string;
  size?: number;
  children?: GitVisSunburstNodeInput[];
}

export function adaptSunburstData(raw: unknown): SunburstNode {
  const wrapped = raw as { tree?: GitVisSunburstNodeInput } | GitVisSunburstNodeInput;
  const root = wrapped && typeof wrapped === 'object' && 'tree' in wrapped ? wrapped.tree : wrapped;
  if (!root || typeof root !== 'object' || !('name' in root)) {
    return { name: '', children: [] };
  }

  const mapNode = (n: GitVisSunburstNodeInput): SunburstNode => {
    const out: SunburstNode = { name: n.name };
    if (n.size !== undefined) {
      out.value = n.size;
    }
    if (n.children?.length) {
      out.children = n.children.map(mapNode);
    }
    return out;
  };
  return mapNode(root);
}

// ============ File Hotspots Adapters ============

interface GitVisHotspotNodeInput {
  name: string;
  nodeType: string;
  changeCount?: number;
  additions?: number;
  deletions?: number;
  lastModified?: string;
  children?: GitVisHotspotNodeInput[];
}

interface HotspotArcMeta {
  changeCount: number;
  additions: number;
  deletions: number;
  lastModified: string | null;
}

/**
 * Adapt hotspot tree for sunburst: filter out file leaves, keep only directories.
 * Returns the adapted tree + arcMeta Map (keyed by arc index) for tooltip/color.
 */
export function adaptHotspotsTree(
  root: GitVisHotspotNodeInput,
  _colorMode: 'heat' | 'time',
): { tree: SunburstNode; arcMeta: Map<number, HotspotArcMeta> } {
  const arcMeta = new Map<number, HotspotArcMeta>();

  const mapNode = (n: GitVisHotspotNodeInput, isRoot: boolean): SunburstNode | null => {
    // Skip file nodes
    if (n.nodeType === 'file') {
      return null;
    }

    // Assign arc ID pre-order (before children), but skip root to match
    // buildArcs' `depth > 0` exclusion in sunburst-chart — otherwise
    // arcMeta.get(i) would be off-by-one and misalign colors/tooltips.
    // `arcMeta.size` at insertion time equals the next pre-order index
    // (excluding root), so it is a stable replacement for a counter.
    if (!isRoot) {
      const arcId = arcMeta.size;
      arcMeta.set(arcId, {
        changeCount: n.changeCount ?? 0,
        additions: n.additions ?? 0,
        deletions: n.deletions ?? 0,
        lastModified: n.lastModified ?? null,
      });
    }

    // Keep all directories (even those with no surviving children after
    // filtering file leaves) — they still represent real hotspots and are
    // counted as arcs by downstream consumers (see countDescendants in
    // FileSunburstChart). Only the root is force-kept by the caller's fallback.
    const children = (n.children ?? [])
      .map((c) => mapNode(c, false))
      .filter((c): c is SunburstNode => c !== null);

    return {
      name: n.name,
      value: n.changeCount ?? 0,
      children: children.length > 0 ? children : [],
    };
  };

  const mapped = mapNode(root, true);
  const tree: SunburstNode = mapped ?? { name: 'root', value: 0, children: [] };
  return { tree, arcMeta };
}

/** Filter flat file list by path prefix (drill-down). */
export function filterFilesByPath<T extends { path: string }>(
  files: T[],
  filterPath: string[],
): T[] {
  if (filterPath.length === 0) {
    return files;
  }
  const prefix = `${filterPath.join('/')}/`;
  return files.filter((f) => f.path.startsWith(prefix));
}

/**
 * Compute fill color for an arc based on color mode.
 * Heat: changeCount normalized to [0, max] → heatmap color scale.
 * Time: lastModified timestamp normalized to [min, max] → heatmap color scale.
 */
export function computeArcFill(
  meta: HotspotArcMeta,
  colorMode: 'heat' | 'time',
  allMetas: HotspotArcMeta[],
): string {
  if (colorMode === 'heat') {
    const maxCount = allMetas.reduce((max, m) => Math.max(max, m.changeCount), 0);
    if (maxCount === 0) {
      return 'var(--heatmap-level-2, #6b7280)';
    }
    const level = Math.min(4, Math.floor((meta.changeCount / maxCount) * 5));
    return `var(--heatmap-level-${level}, #6b7280)`;
  }

  // time mode
  const timestamps = allMetas
    .map((m) => (m.lastModified ? Date.parse(m.lastModified) : 0))
    .filter((t) => !Number.isNaN(t));
  if (timestamps.length === 0) {
    return 'var(--heatmap-level-2, #6b7280)';
  }

  const minT = Math.min(...timestamps);
  const maxT = Math.max(...timestamps);
  if (maxT === minT) {
    return 'var(--heatmap-level-2, #6b7280)';
  }

  const currentT = meta.lastModified ? Date.parse(meta.lastModified) : 0;
  if (Number.isNaN(currentT)) {
    return 'var(--heatmap-level-0, #1f2937)';
  }

  const level = Math.min(4, Math.floor(((currentT - minT) / (maxT - minT)) * 5));
  return `var(--heatmap-level-${level}, #6b7280)`;
}
