import type { HeatmapColumn, HeatmapBin } from '@/components/charts/heatmap/heatmap-context';

/** Git 可视化模拟数据 */

export interface CommitNode {
  id: string;
  hash: string;
  branch: string;
  date: string;
  message: string;
  author: string;
  authorEmail: string;
  tag?: string;
}

export interface CommitEdge {
  source: string;
  target: string;
}

export const commitNodes: CommitNode[] = [
  // ---- main branch (linear spine) ----
  {
    id: 'a1',
    hash: 'a0a1a2',
    branch: 'main',
    date: '2026-01-01',
    message: 'Initial project setup',
    author: 'Alex',
    authorEmail: 'alex@example.com',
  },
  {
    id: 'a2',
    hash: 'a1a2a3',
    branch: 'main',
    date: '2026-01-03',
    message: 'Add core utility modules',
    author: 'Alex',
    authorEmail: 'alex@example.com',
  },
  {
    id: 'a3',
    hash: 'a2a3a4',
    branch: 'main',
    date: '2026-01-05',
    message: 'Configure CI/CD pipeline',
    author: 'Alex',
    authorEmail: 'alex@example.com',
  },
  {
    id: 'a7',
    hash: 'a6a7a8',
    branch: 'main',
    date: '2026-01-20',
    message: 'Merge branch feature-1',
    author: 'Alex',
    authorEmail: 'alex@example.com',
  },
  {
    id: 'a8',
    hash: 'a7a8a9',
    branch: 'main',
    date: '2026-01-22',
    message: 'Bump version to 1.1',
    author: 'Alex',
    authorEmail: 'alex@example.com',
  },
  {
    id: 'a10',
    hash: 'a9a0a1',
    branch: 'main',
    date: '2026-02-01',
    message: 'Update README and changelog',
    author: 'Alex',
    authorEmail: 'alex@example.com',
  },
  {
    id: 'a14',
    hash: 'd0e1f2',
    branch: 'main',
    date: '2026-02-20',
    message: 'Merge: feature-1, hotfix, main',
    author: 'Evan',
    authorEmail: 'evan@example.com',
  },
  {
    id: 'a15',
    hash: 'e7f8a9',
    branch: 'main',
    date: '2026-02-22',
    message: 'Release v2.0',
    author: 'Alex',
    authorEmail: 'alex@example.com',
  },

  // ---- feature-1 (long-lived, 8 commits) ----
  {
    id: 'b1',
    hash: 'b0b1b2',
    branch: 'feature-1',
    date: '2026-01-06',
    message: 'Init feature-1: auth system',
    author: 'Ben',
    authorEmail: 'ben@example.com',
  },
  {
    id: 'b2',
    hash: 'b1b2b3',
    branch: 'feature-1',
    date: '2026-01-08',
    message: 'Setup auth middleware',
    author: 'Ben',
    authorEmail: 'ben@example.com',
  },
  {
    id: 'b3',
    hash: 'b2b3b4',
    branch: 'feature-1',
    date: '2026-01-10',
    message: 'Add user model',
    author: 'Ben',
    authorEmail: 'ben@example.com',
  },
  {
    id: 'b4',
    hash: 'b3b4b5',
    branch: 'feature-1',
    date: '2026-01-12',
    message: 'Add login page UI',
    author: 'Ben',
    authorEmail: 'ben@example.com',
  },
  {
    id: 'b5',
    hash: 'b4b5b6',
    branch: 'feature-1',
    date: '2026-01-15',
    message: 'Complete auth flow',
    author: 'Ben',
    authorEmail: 'ben@example.com',
  },
  {
    id: 'b6',
    hash: 'b5b6b7',
    branch: 'feature-1',
    date: '2026-01-25',
    message: 'Update API documentation',
    author: 'Cara',
    authorEmail: 'cara@example.com',
  },
  {
    id: 'b7',
    hash: 'b6b7b8',
    branch: 'feature-1',
    date: '2026-02-05',
    message: 'Refactor auth module',
    author: 'Ben',
    authorEmail: 'ben@example.com',
  },
  {
    id: 'b8',
    hash: 'b7b8b9',
    branch: 'feature-1',
    date: '2026-02-15',
    message: 'Add final integration tests',
    author: 'Ben',
    authorEmail: 'ben@example.com',
  },

  // ---- feature-2 (5 commits, unmerged) ----
  {
    id: 'c1',
    hash: 'c0c1c2',
    branch: 'feature-2',
    date: '2026-01-07',
    message: 'Init feature-2: dashboard',
    author: 'Cara',
    authorEmail: 'cara@example.com',
  },
  {
    id: 'c2',
    hash: 'c1c2c3',
    branch: 'feature-2',
    date: '2026-01-09',
    message: 'Add API routes',
    author: 'Cara',
    authorEmail: 'cara@example.com',
  },
  {
    id: 'c3',
    hash: 'c2c3c4',
    branch: 'feature-2',
    date: '2026-01-11',
    message: 'Build dashboard layout',
    author: 'Cara',
    authorEmail: 'cara@example.com',
  },
  {
    id: 'c4',
    hash: 'c3c4c5',
    branch: 'feature-2',
    date: '2026-01-18',
    message: 'Fix review comments',
    author: 'Cara',
    authorEmail: 'cara@example.com',
  },
  {
    id: 'c5',
    hash: 'c4c5c6',
    branch: 'feature-2',
    date: '2026-01-28',
    message: 'Dashboard v2 work-in-progress',
    author: 'Cara',
    authorEmail: 'cara@example.com',
  },

  // ---- feature-3 (4 commits, forks from feature-2, merges into feature-2) ----
  {
    id: 'd1',
    hash: 'd0d1d2',
    branch: 'feature-3',
    date: '2026-01-13',
    message: 'Init feature-3: query optimization',
    author: 'Diana',
    authorEmail: 'diana@example.com',
  },
  {
    id: 'd2',
    hash: 'd1d2d3',
    branch: 'feature-3',
    date: '2026-01-16',
    message: 'Add pagination support',
    author: 'Diana',
    authorEmail: 'diana@example.com',
  },
  {
    id: 'd3',
    hash: 'd2d3d4',
    branch: 'feature-3',
    date: '2026-01-21',
    message: 'Optimize slow queries',
    author: 'Diana',
    authorEmail: 'diana@example.com',
  },
  {
    id: 'd4',
    hash: 'd3d4d5',
    branch: 'feature-3',
    date: '2026-01-26',
    message: 'Merge feature-4 into feature-3',
    author: 'Diana',
    authorEmail: 'diana@example.com',
  },

  // ---- feature-4 (2 commits, forks from feature-3, merges into feature-3) ----
  {
    id: 'e1',
    hash: 'e0e1e2',
    branch: 'feature-4',
    date: '2026-01-17',
    message: 'Init feature-4: analytics module',
    author: 'Evan',
    authorEmail: 'evan@example.com',
  },
  {
    id: 'e2',
    hash: 'e1e2e3',
    branch: 'feature-4',
    date: '2026-01-19',
    message: 'Add data export feature',
    author: 'Evan',
    authorEmail: 'evan@example.com',
  },

  // ---- release/v1.0 (2 commits from a8, tag v1.0) ----
  {
    id: 'r1',
    hash: 'r0r1r2',
    branch: 'release/v1.0',
    date: '2026-01-24',
    message: 'v1.0 release candidate',
    author: 'Evan',
    authorEmail: 'evan@example.com',
  },
  {
    id: 'r2',
    hash: 'r1r2r3',
    branch: 'release/v1.0',
    date: '2026-01-27',
    message: 'v1.0 release candidate 2',
    author: 'Evan',
    authorEmail: 'evan@example.com',
    tag: 'v1.0',
  },

  // ---- hotfix (2 commits from a10) ----
  {
    id: 'h1',
    hash: 'h1h2h3',
    branch: 'hotfix',
    date: '2026-02-05',
    message: 'Urgent: security patch',
    author: 'Diana',
    authorEmail: 'diana@example.com',
  },
  {
    id: 'h2',
    hash: 'h3h4i5',
    branch: 'hotfix',
    date: '2026-02-10',
    message: 'Apply hotfix v2',
    author: 'Diana',
    authorEmail: 'diana@example.com',
  },
];

export const commitEdges: CommitEdge[] = [
  // main spine
  { source: 'a2', target: 'a1' },
  { source: 'a3', target: 'a2' },
  // feature-1 from a3
  { source: 'b1', target: 'a3' },
  { source: 'b2', target: 'b1' },
  { source: 'b3', target: 'b2' },
  { source: 'b4', target: 'b3' },
  // feature-2 from a3
  { source: 'c1', target: 'a3' },
  { source: 'c2', target: 'c1' },
  { source: 'c3', target: 'c2' },
  // feature-3 from feature-2 (c3)
  { source: 'd1', target: 'c3' },
  { source: 'd2', target: 'd1' },
  // feature-4 from feature-3 (d2)
  { source: 'e1', target: 'd2' },
  { source: 'e2', target: 'e1' },
  // feature-3 continues
  { source: 'd3', target: 'd2' },
  // d4 = merge of feature-3 + feature-4
  { source: 'd4', target: 'd3' },
  { source: 'd4', target: 'e2' },
  // feature-2 continues after feature-3 merge
  { source: 'c4', target: 'c3' },
  { source: 'c4', target: 'd4' },
  { source: 'c5', target: 'c4' },
  // feature-1 continues
  { source: 'b5', target: 'b4' },
  // a7 = merge of feature-1 (b5) + main (a3)
  { source: 'a7', target: 'b5' },
  { source: 'a7', target: 'a3' },
  // main continues
  { source: 'a8', target: 'a7' },
  // release/v1.0 from a8
  { source: 'r1', target: 'a8' },
  { source: 'r2', target: 'r1' },
  // feature-1 continues after merge
  { source: 'b6', target: 'b5' },
  { source: 'b7', target: 'b6' },
  { source: 'b8', target: 'b7' },
  // main continues
  { source: 'a10', target: 'a8' },
  // hotfix from a10
  { source: 'h1', target: 'a10' },
  { source: 'h2', target: 'h1' },
  // a14 = octopus merge: feature-1 (b8) + hotfix (h2) + main (a10)
  { source: 'a14', target: 'b8' },
  { source: 'a14', target: 'h2' },
  { source: 'a14', target: 'a10' },
  // main continues
  { source: 'a15', target: 'a14' },
];

export const allBranches = [
  'main',
  'feature-1',
  'feature-2',
  'feature-3',
  'feature-4',
  'release/v1.0',
  'hotfix',
];

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
  raw: ReturnType<typeof generateCodeLineEvolutionData>,
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
      ((d.getTime() - weekStart.getTime()) / 86400000 + weekStartDay + 1) / 7,
    );
    if (!weekMap.has(weekNum)) {
      weekMap.set(weekNum, []);
    }
    weekMap.get(weekNum)!.push({ count, bin: d.getDay(), date: d });
  }
  return [...weekMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([weekNum, bins]) => {
      const existingDays = new Set(bins.map((b) => b.bin));
      const sortedBins = [...bins].sort((a, b) => a.bin - b.bin);
      const weekDate = new Date(sortedBins[0].date);
      weekDate.setDate(weekDate.getDate() - sortedBins[0].bin);
      const allBins: HeatmapBin[] = [];
      for (let day = 0; day < 7; day++) {
        if (existingDays.has(day)) {
          const existing = bins.find((b) => b.bin === day)!;
          allBins.push(existing);
        } else {
          const date = new Date(weekDate);
          date.setDate(date.getDate() + day);
          allBins.push({ count: 0, bin: day, date });
        }
      }
      return { bin: weekNum, bins: allBins };
    });
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
    columns.push({ bin: w, bins, columnLabel: String(w + 1) });
  }
  return columns;
}

export const moduleNames = ['前端', '后端', '数据库', '测试', '文档'];

export const contributorModuleMatrix: number[][] = [
  [80, 30, 0, 0, 0],
  [20, 70, 40, 0, 0],
  [0, 60, 0, 50, 0],
  [90, 0, 0, 0, 30],
  [0, 0, 80, 20, 0],
  [0, 0, 0, 40, 70],
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
