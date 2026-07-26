import { runGit } from './git';

function parseDateParts(iso: string): { year: number; week: number; dayOfWeek: number; hour: number } | null {
  if (iso.length < 13) return null;
  const year = parseInt(iso.substring(0, 4), 10);
  const month = parseInt(iso.substring(5, 7), 10);
  const day = parseInt(iso.substring(8, 10), 10);
  const hour = parseInt(iso.substring(11, 13), 10);
  const d = new Date(year, month - 1, day);
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = d.getDay() === 0 ? 6 : d.getDay() - 1;
  const week = Math.ceil(((d.getTime() - jan4.getTime()) / 86400000 + 1) / 7);
  return { year, week: Math.max(1, week), dayOfWeek, hour };
}

function startOfWeek(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d.setDate(diff));
  return mon.toISOString().substring(0, 10);
}

export async function handleCommitStats(rootPath: string, since?: string, until?: string) {
  const filterArgs: string[] = [];
  if (since) filterArgs.push('--since', since);
  if (until) filterArgs.push('--until', until);
  const raw = (await runGit(rootPath, ['log', '--pretty=format:%H|%h|%aI|%an|%ae|%s', ...filterArgs])) ?? '';
  const lines = raw.split('\n').filter(Boolean);

  const dailyMap = new Map<string, number>();
  const hourlyMap = new Map<string, number>();
  const authorMap = new Map<string, { email: string; total: number; periods: Map<string, number> }>();
  let cumulative = 0;
  const timeline: { date: string; cumulative: number }[] = [];
  const commits: unknown[] = [];

  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length < 6) continue;
    const [hash, shortHash, date, author, authorEmail, message] = parts;
    const date10 = date.substring(0, 10);
    dailyMap.set(date10, (dailyMap.get(date10) || 0) + 1);

    const dp = parseDateParts(date);
    if (dp) {
      hourlyMap.set(`${dp.dayOfWeek}|${dp.hour}`, (hourlyMap.get(`${dp.dayOfWeek}|${dp.hour}`) || 0) + 1);
      const weekKey = `${dp.year}-W${String(dp.week).padStart(2, '0')}`;
      const entry = authorMap.get(author) || { email: authorEmail, total: 0, periods: new Map() };
      entry.total++;
      entry.periods.set(weekKey, (entry.periods.get(weekKey) || 0) + 1);
      authorMap.set(author, entry);
    }

    cumulative++;
    timeline.push({ date: date10, cumulative });
    commits.push({ hash, shortHash, date, author, authorEmail, message });
  }

  return {
    dailyCommits: Array.from(dailyMap, ([date, count]) => ({ date, count })),
    hourlyDistribution: Array.from(hourlyMap, ([key, count]) => {
      const [d, h] = key.split('|');
      return { day: parseInt(d, 10), hour: parseInt(h, 10), count };
    }),
    contributorActivity: Array.from(authorMap, ([author, v]) => ({
      author, authorEmail: v.email, totalCommits: v.total,
      periods: Array.from(v.periods, ([period, count]) => ({ period, count })),
    })),
    commitTimeline: timeline,
    commits,
  };
}

export async function handleCodeEvolution(rootPath: string, since?: string, until?: string) {
  const filterArgs: string[] = [];
  if (since) filterArgs.push('--since', since);
  if (until) filterArgs.push('--until', until);
  const raw = (await runGit(rootPath, ['log', '--pretty=format:%H|%aI', '--numstat', ...filterArgs])) ?? '';
  const weekMap = new Map<string, { additions: number; deletions: number }>();

  let currentDate = '';
  for (const line of raw.split('\n')) {
    const parts = line.split('\t');
    if (parts.length === 3) {
      const add = parseInt(parts[0], 10) || 0;
      const del = parseInt(parts[1], 10) || 0;
      const ws = startOfWeek(currentDate || parts[2]?.substring(0, 10) || '');
      const entry = weekMap.get(ws) || { additions: 0, deletions: 0 };
      entry.additions += add;
      entry.deletions += del;
      weekMap.set(ws, entry);
    } else if (line.includes('|') && line.startsWith('20')) {
      currentDate = line.split('|')[1] || '';
    }
  }

  return {
    weeks: Array.from(weekMap, ([weekStart, v]) => ({ weekStart, ...v })),
  };
}

export async function handleContributorModules(rootPath: string, since?: string, until?: string) {
  const filterArgs: string[] = [];
  if (since) filterArgs.push('--since', since);
  if (until) filterArgs.push('--until', until);
  const raw = (await runGit(rootPath, ['-c', 'core.quotepath=false', 'log', '--pretty=format:%an|%ae', '--name-only', ...filterArgs])) ?? '';

  const authorModules = new Map<string, { email: string; modules: Map<string, number> }>();
  let currentAuthor = '';
  let currentEmail = '';

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.includes('|')) {
      const parts = trimmed.split('|');
      currentAuthor = parts[0];
      currentEmail = parts[1] || '';
    } else if (currentAuthor) {
      const topDir = trimmed.split('/')[0];
      const entry = authorModules.get(currentAuthor) || { email: currentEmail, modules: new Map() };
      entry.modules.set(topDir, (entry.modules.get(topDir) || 0) + 1);
      authorModules.set(currentAuthor, entry);
    }
  }

  // Collect directory tree statistics
  const dirStats = new Map<string, number>();
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.includes('|')) continue;
    const parts = trimmed.split('/');
    for (let i = 0; i < parts.length; i++) {
      const ancestor = parts.slice(0, i + 1).join('/');
      dirStats.set(ancestor, (dirStats.get(ancestor) || 0) + 1);
    }
  }

  return {
    matrix: Array.from(authorModules, ([author, v]) => ({
      author, authorEmail: v.email,
      modules: Array.from(v.modules, ([module, count]) => ({ module, count })),
    })),
    allDirectories: Array.from(dirStats, ([path, count]) => ({
      path,
      depth: path.split('/').length,
      commitCount: count,
    })),
  };
}

export async function handleBranchGraph(rootPath: string) {
  const raw = (await runGit(rootPath, ['log', '--all', '--topo-order', '--pretty=format:%H|%h|%P|%D|%aI|%an|%ae|%s'])) ?? '';
  const nodes: unknown[] = [];
  const edges: unknown[] = [];
  const branchSet = new Set<string>();

  for (const line of raw.split('\n')) {
    const parts = line.split('|');
    if (parts.length < 8) continue;
    const [hash, shortHash, parentRaw, refsRaw, date, author, authorEmail, message] = parts;
    const parentHashes = (parentRaw || '').split(' ').filter(Boolean);
    let branch = '';
    let tag: string | undefined;
    const refs = (refsRaw || '').split(', ');
    for (const r of refs) {
      if (r.startsWith('tag: ')) tag = r.substring(5);
      else if (r.startsWith('HEAD -> ')) { branch = r.substring(8); branchSet.add(branch); }
      else if (r) { branch = r; branchSet.add(branch); }
    }
    for (const p of parentHashes) { edges.push({ from: hash, to: p }); }
    nodes.push({ hash, shortHash, parentHashes, branch, date, author, authorEmail, message, tag });
  }

  return { nodes, edges, branches: Array.from(branchSet) };
}

export async function handleFileSunburst(rootPath: string) {
  const raw = (await runGit(rootPath, ['ls-files'])) ?? '';
  const files = raw.split('\n').filter(Boolean);

  interface SunburstNode { name: string; type: string; size?: number; children?: SunburstNode[] }
  const tree: SunburstNode = { name: 'root', type: 'directory', children: [] };

  for (const file of files) {
    const parts = file.split('/');
    let current = tree;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isFile = i === parts.length - 1;
      current.children = current.children || [];
      let child = current.children.find(c => c.name === name);
      if (!child) {
        child = { name, type: isFile ? 'file' : 'directory', size: isFile ? 1 : undefined, children: isFile ? undefined : [] };
        current.children.push(child);
      } else if (isFile) {
        child.size = (child.size || 0) + 1;
      }
      current = child;
    }
  }

  return { tree };
}
