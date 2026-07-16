import type { HeatmapColumn, HeatmapBin } from '@/components/charts/heatmap/heatmap-context';

/** Git 可视化模拟数据，从 Git可视化设计.md 提取 */

export interface CommitNode {
  id: string;
  name: string;
  branch: string;
  date: string;
}

export interface CommitEdge {
  source: string;
  target: string;
}

export const commitNodes: CommitNode[] = [
  { id: 'a1', name: 'a1b2c3', branch: 'main', date: '2026-01-01' },
  { id: 'a2', name: 'd4e5f6', branch: 'main', date: '2026-01-03' },
  { id: 'a3', name: 'g7h8i9', branch: 'main', date: '2026-01-05' },
  { id: 'b1', name: 'j0k1l2', branch: 'feature-1', date: '2026-01-06' },
  { id: 'b2', name: 'm3n4o5', branch: 'feature-1', date: '2026-01-08' },
  { id: 'b3', name: 'p6q7r8', branch: 'feature-1', date: '2026-01-10' },
  { id: 'c1', name: 's9t0u1', branch: 'feature-2', date: '2026-01-07' },
  { id: 'c2', name: 'v2w3x4', branch: 'feature-2', date: '2026-01-09' },
  { id: 'c3', name: 'y5z6a7', branch: 'feature-2', date: '2026-01-11' },
  { id: 'merge1', name: 'b8c9d0', branch: 'main', date: '2026-01-12' },
  { id: 'hotfix1', name: 'e1f2g3', branch: 'hotfix', date: '2026-01-13' },
  { id: 'merge2', name: 'h4i5j6', branch: 'main', date: '2026-01-14' },
];

export const commitEdges: CommitEdge[] = [
  { source: 'a2', target: 'a1' },
  { source: 'a3', target: 'a2' },
  { source: 'b1', target: 'a3' },
  { source: 'b2', target: 'b1' },
  { source: 'b3', target: 'b2' },
  { source: 'c1', target: 'a3' },
  { source: 'c2', target: 'c1' },
  { source: 'c3', target: 'c2' },
  { source: 'merge1', target: 'b3' },
  { source: 'merge1', target: 'c3' },
  { source: 'hotfix1', target: 'merge1' },
  { source: 'merge2', target: 'hotfix1' },
  { source: 'merge2', target: 'a3' },
];

export const allBranches = ['main', 'feature-1', 'feature-2', 'hotfix'];

/** 日历热力图数据：[date, count] */
export function generateCalendarData(): [string, number][] {
  const data: [string, number][] = [];
  const start = new Date('2025-07-01');
  const end = new Date('2026-06-30');
  const cur = new Date(start);
  // 使用固定种子的伪随机，确保测试可复现
  let seed = 42;
  const pseudoRandom = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  while (cur <= end) {
    const count = Math.floor(pseudoRandom() * 8);
    if (count > 0) {
      const dateStr =
        cur.getFullYear() +
        '-' +
        String(cur.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(cur.getDate()).padStart(2, '0');
      data.push([dateStr, count]);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return data;
}

export const contributorNames = ['Alex', 'Ben', 'Cara', 'Diana', 'Evan', 'Fiona'];
export const contributorTotalCommits = [45, 38, 27, 53, 19, 32];

/** Treemap 数据 */
export const fileTreemapData = {
  name: 'root',
  children: [
    {
      name: 'src',
      children: [
        { name: 'main.js', value: 120 },
        { name: 'utils.js', value: 85 },
        { name: 'api.js', value: 65 },
        {
          name: 'components',
          children: [
            { name: 'Header.vue', value: 45 },
            { name: 'Footer.vue', value: 30 },
            { name: 'Sidebar.vue', value: 55 },
          ],
        },
      ],
    },
    {
      name: 'tests',
      children: [
        { name: 'test_main.js', value: 40 },
        { name: 'test_utils.js', value: 35 },
      ],
    },
    {
      name: 'docs',
      children: [
        { name: 'README.md', value: 20 },
        { name: 'CONTRIBUTING.md', value: 15 },
      ],
    },
    {
      name: 'config',
      children: [
        { name: 'webpack.config.js', value: 25 },
        { name: 'eslint.json', value: 10 },
      ],
    },
  ],
};

/** 代码行数演变数据 */
export function generateCodeLineEvolutionData(): {
  dates: string[];
  added: number[];
  deleted: number[];
} {
  const dates: string[] = [];
  const added: number[] = [];
  const deleted: number[] = [];
  let baseAdd = 5000;
  let baseDel = 2000;
  const now = new Date('2026-01-01');
  let seed = 777;
  const pseudoRandom = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < 40; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - (39 - i) * 7);
    dates.push(d.getMonth() + 1 + '/' + d.getDate());
    baseAdd += Math.floor(pseudoRandom() * 600) + 100;
    baseDel += Math.floor(pseudoRandom() * 300) + 50;
    added.push(baseAdd);
    deleted.push(baseDel);
  }
  return { dates, added, deleted };
}



// ── Bklit/visx data adapter interfaces ──

export interface BklitAreaRow {
  date: string;
  added: number;
  deleted: number;
  [key: string]: unknown;
}

// ── Bklit/visx data adapters ──

export function toBklitAreaData(
  raw: ReturnType<typeof generateCodeLineEvolutionData>
): BklitAreaRow[] {
  return raw.dates.map((date, i) => ({
    date,
    added: raw.added[i],
    deleted: raw.deleted[i],
  }));
}



export function toHeatmapColumns(): HeatmapColumn[] {
  const raw = generateCalendarData();
  const weekMap = new Map<number, { count: number; bin: number; date: Date }[]>();
  for (const [dateStr, count] of raw) {
    const d = new Date(dateStr);
    const weekStart = new Date(d.getFullYear(), 0, 1);
    const weekStartDay = weekStart.getDay();
    const weekNum = Math.ceil(
      ((d.getTime() - weekStart.getTime()) / 86400000 + weekStartDay + 1) / 7
    );
    if (!weekMap.has(weekNum)) {
      weekMap.set(weekNum, []);
    }
    weekMap.get(weekNum)!.push({ count, bin: d.getDay(), date: d });
  }
  return [...weekMap.entries()].sort(([a], [b]) => a - b).map(([bin, bins]) => ({ bin, bins }));
}



export interface CommitTimelineRow {
  date: string;
  count: number;
  cumulative: number;
  [key: string]: unknown;
}

export const mockCommitTimelineData: CommitTimelineRow[] = [
  { date: '2026-01-01', count: 1, cumulative: 1 },
  { date: '2026-01-03', count: 1, cumulative: 2 },
  { date: '2026-01-05', count: 1, cumulative: 3 },
  { date: '2026-01-06', count: 1, cumulative: 4 },
  { date: '2026-01-07', count: 1, cumulative: 5 },
  { date: '2026-01-08', count: 1, cumulative: 6 },
  { date: '2026-01-09', count: 1, cumulative: 7 },
  { date: '2026-01-10', count: 1, cumulative: 8 },
  { date: '2026-01-11', count: 1, cumulative: 9 },
  { date: '2026-01-12', count: 1, cumulative: 10 },
  { date: '2026-01-13', count: 1, cumulative: 11 },
  { date: '2026-01-14', count: 1, cumulative: 12 },
];

export function generateClockHeatmapData(): HeatmapColumn[] {
  const columns: HeatmapColumn[] = [];
  let seed = 123;
  const pseudoRandom = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let h = 0; h < 24; h++) {
    const bins: HeatmapBin[] = [];
    for (let d = 0; d < 7; d++) {
      let base: number;
      if (h >= 9 && h <= 18) {
        base = Math.floor(pseudoRandom() * 6) + 3;
      } else if (h >= 19 && h <= 23) {
        base = Math.floor(pseudoRandom() * 3);
      } else {
        base = Math.floor(pseudoRandom() * 2);
      }
      if (d === 0 || d === 6) {
        base = Math.floor(base * 0.3);
      }
      bins.push({ count: base, bin: d });
    }
    columns.push({ bin: h, bins, columnLabel: String(h) });
  }
  return columns;
}

export function generateContributorActivityData(): HeatmapColumn[] {
  const columns: HeatmapColumn[] = [];
  let seed = 456;
  const pseudoRandom = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let w = 0; w < 48; w++) {
    const bins: HeatmapBin[] = [];
    for (let c = 0; c < contributorNames.length; c++) {
      const maxWeekly = Math.ceil(contributorTotalCommits[c] / 12);
      const count = Math.floor(pseudoRandom() * maxWeekly);
      bins.push({ count, bin: c });
    }
    columns.push({ bin: w, bins });
  }
  return columns;
}

export const moduleNames = ['前端', '后端', '数据库', '测试', '文档'];

export const contributorModuleMatrix: number[][] = [
  [80, 30,  0,  0,  0],
  [20, 70, 40,  0,  0],
  [ 0, 60,  0, 50,  0],
  [90,  0,  0,  0, 30],
  [ 0,  0, 80, 20,  0],
  [ 0,  0,  0, 40, 70],
];

export function generateContributorModuleData(): HeatmapColumn[] {
  return moduleNames.map((module, mi) => ({
    bin: mi,
    columnLabel: module,
    bins: contributorModuleMatrix.map((row, ci) => ({
      count: row[mi],
      bin: ci,
    })),
  }));
}


