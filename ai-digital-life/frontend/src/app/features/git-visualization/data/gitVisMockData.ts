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

/** 时钟热力图数据：[hour, day, count] */
export const clockHeatmapData: [number, number, number][] = (() => {
  const data: [number, number, number][] = [];
  let seed = 123;
  const pseudoRandom = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
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
      data.push([h, d, base]);
    }
  }
  return data;
})();

export const contributorNames = ['Alex', 'Ben', 'Cara', 'Diana', 'Evan', 'Fiona'];
export const contributorCommits = [45, 38, 27, 53, 19, 32];
export const contributorAdded = [3200, 2800, 1500, 4100, 900, 2200];
export const contributorDeleted = [1200, 800, 600, 1800, 300, 700];

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

/** 桑基图数据 */
export const sankeyNodes = [
  { name: 'Alex' },
  { name: 'Ben' },
  { name: 'Cara' },
  { name: 'Diana' },
  { name: 'Evan' },
  { name: 'Fiona' },
  { name: '前端' },
  { name: '后端' },
  { name: '数据库' },
  { name: '测试' },
  { name: '文档' },
];

export const sankeyLinks = [
  { source: 'Alex', target: '前端', value: 80 },
  { source: 'Alex', target: '后端', value: 30 },
  { source: 'Ben', target: '前端', value: 20 },
  { source: 'Ben', target: '后端', value: 70 },
  { source: 'Ben', target: '数据库', value: 40 },
  { source: 'Cara', target: '后端', value: 60 },
  { source: 'Cara', target: '测试', value: 50 },
  { source: 'Diana', target: '前端', value: 90 },
  { source: 'Diana', target: '文档', value: 30 },
  { source: 'Evan', target: '数据库', value: 80 },
  { source: 'Evan', target: '测试', value: 20 },
  { source: 'Fiona', target: '文档', value: 70 },
  { source: 'Fiona', target: '测试', value: 40 },
];

// ── Bklit/visx data adapter interfaces ──

export interface BklitAreaRow {
  date: string;
  added: number;
  deleted: number;
}

export interface BklitSankeyNode {
  id: string;
  label: string;
}

export interface BklitSankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface BklitHeatmapCell {
  x: number;
  y: number;
  value: number;
}

export interface BklitContributorRow {
  name: string;
  commits: number;
  added: number;
  deleted: number;
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

export function toBklitSankeyData(): { nodes: BklitSankeyNode[]; links: BklitSankeyLink[] } {
  return {
    nodes: sankeyNodes.map((n) => ({ id: n.name, label: n.name })),
    links: sankeyLinks,
  };
}

export function toClockHeatmapData(): BklitHeatmapCell[] {
  return clockHeatmapData.map(([hour, day, count]) => ({ x: hour, y: day, value: count }));
}

export function toCalendarHeatmapData(): BklitHeatmapCell[] {
  return generateCalendarData().map(([dateStr, count]) => {
    const d = new Date(dateStr);
    const weekStart = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil(
      ((d.getTime() - weekStart.getTime()) / 86400000 + weekStart.getDay() + 1) / 7
    );
    return { x: d.getDay(), y: weekNum, value: count };
  });
}

export interface CommitTimelineRow {
  date: string;
  count: number;
  cumulative: number;
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

export function toContributorData(): BklitContributorRow[] {
  return contributorNames.map((name, i) => ({
    name,
    commits: contributorCommits[i],
    added: contributorAdded[i],
    deleted: contributorDeleted[i],
  }));
}
