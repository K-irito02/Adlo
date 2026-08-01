import { runGit } from './git';

/** ISO `%aI` → { year, month, dayOfWeek, hour } matching the Rust `parse_date_parts`. */
export function parseDateParts(iso: string): {
  year: number;
  month: number;
  dayOfWeek: number;
  hour: number;
} | null {
  if (iso.length < 13) return null;
  const year = parseInt(iso.substring(0, 4), 10);
  const month = parseInt(iso.substring(5, 7), 10);
  const day = parseInt(iso.substring(8, 10), 10);
  const hour = parseInt(iso.substring(11, 13), 10);
  const d = new Date(year, month - 1, day);
  // Match the Rust backend convention: 0 = Sunday .. 6 = Saturday (drives the
  // hourly heatmap rows whose top row is Sunday).
  const dayOfWeek = d.getDay();
  return { year, month, dayOfWeek, hour };
}

/**
 * Parses a commit header line emitted by `--pretty=format:%H|%aI` and returns
 * the leading `YYYY-MM-DD` date, or null for any other line (numstat rows,
 * blank lines, malformed input). Matches the Rust backend's `header_date`.
 */
export function parseCommitHeader(line: string): string | null {
  const pipePos = line.indexOf('|');
  if (pipePos === -1) return null;
  const datePart = line.slice(pipePos + 1);
  if (datePart.length < 10) return null;
  const head = datePart.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}/.test(head)) return null;
  return head;
}

/**
 * Aggregates `git log --numstat` output into per-day totals, matching the Rust
 * backend shape `{ days: [{ date, additions, deletions }] }`.
 */
export function aggregateCodeEvolutionDays(
  raw: string,
): { date: string; additions: number; deletions: number }[] {
  const dayMap = new Map<string, { additions: number; deletions: number }>();
  let currentDate: string | null = null;
  for (const line of raw.split('\n')) {
    const parts = line.split('\t');
    if (parts.length === 3) {
      const add = parseInt(parts[0], 10) || 0;
      const del = parseInt(parts[1], 10) || 0;
      if (currentDate) {
        const entry = dayMap.get(currentDate) ?? { additions: 0, deletions: 0 };
        entry.additions += add;
        entry.deletions += del;
        dayMap.set(currentDate, entry);
      }
    } else {
      const date = parseCommitHeader(line);
      if (date) {
        currentDate = date;
      }
    }
  }
  return Array.from(dayMap, ([date, v]) => ({ date, ...v })).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}

/**
 * Builds a day-by-day ascending commit timeline `[{ date, count, cumulative }]`,
 * matching the Rust backend's `build_daily_timeline`.
 */
export function buildCommitTimeline(dailyMap: Map<string, number>): {
  date: string;
  count: number;
  cumulative: number;
}[] {
  const sortedDates = [...dailyMap.keys()].sort();
  let cumulative = 0;
  return sortedDates.map((date) => {
    const count = dailyMap.get(date) ?? 0;
    cumulative += count;
    return { date, count, cumulative };
  });
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
  const commits: unknown[] = [];

  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length < 6) continue;
    // Rust uses splitn(6, '|') — the message is the remainder, which may itself
    // contain '|'. Reassemble everything after the first 5 fields.
    const [hash, shortHash, date, author, authorEmail] = parts;
    const message = parts.slice(5).join('|');
    const date10 = date.substring(0, 10);
    dailyMap.set(date10, (dailyMap.get(date10) || 0) + 1);

    const dp = parseDateParts(date);
    if (dp) {
      hourlyMap.set(`${dp.dayOfWeek}|${dp.hour}`, (hourlyMap.get(`${dp.dayOfWeek}|${dp.hour}`) || 0) + 1);
      // Match Rust: contributor activity periods are month keys (YYYY-MM)
      // with a numeric `month` field, not ISO week keys.
      const monthKey = `${dp.year}-${String(dp.month).padStart(2, '0')}`;
      const entry = authorMap.get(author) || { email: authorEmail, total: 0, periods: new Map() };
      entry.total++;
      entry.periods.set(monthKey, (entry.periods.get(monthKey) || 0) + 1);
      authorMap.set(author, entry);
    }

    commits.push({ hash, shortHash, date, author, authorEmail, message });
  }

  const commitTimeline = buildCommitTimeline(dailyMap);
  const dailyCommits = [...dailyMap.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    dailyCommits,
    hourlyDistribution: Array.from(hourlyMap, ([key, count]) => {
      const [d, h] = key.split('|');
      return { day: parseInt(d, 10), hour: parseInt(h, 10), count };
    }),
    contributorActivity: Array.from(authorMap, ([author, v]) => ({
      author, authorEmail: v.email, totalCommits: v.total,
      periods: Array.from(v.periods, ([period, count]) => {
        const month = parseInt(period.slice(5), 10) || 1;
        return { period, month, count };
      }),
    })),
    commitTimeline,
    commits,
  };
}

export async function handleCodeEvolution(rootPath: string, since?: string, until?: string) {
  const filterArgs: string[] = [];
  if (since) filterArgs.push('--since', since);
  if (until) filterArgs.push('--until', until);
  const raw = (await runGit(rootPath, ['log', '--pretty=format:%H|%aI', '--numstat', ...filterArgs])) ?? '';
  return { days: aggregateCodeEvolutionDays(raw) };
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

  return {
    matrix: Array.from(authorModules, ([author, v]) => ({
      author, authorEmail: v.email,
      modules: Array.from(v.modules, ([module, count]) => ({ module, count })),
    })),
  };
}

export async function handleBranchGraph(rootPath: string) {
  const raw = (await runGit(rootPath, ['log', '--all', '--topo-order', '--pretty=format:%B%x00%H|%h|%P|%D|%aI|%an|%ae%x00'])) ?? '';
  const nodes: unknown[] = [];
  const edges: unknown[] = [];
  const branchSet = new Set<string>();

  const nullParts = raw === '' ? [] : raw.split('\0');

  let headBranch = '';

  for (let i = 0; i + 1 < nullParts.length; i += 2) {
    const message = nullParts[i].trim();
    const header = nullParts[i + 1];
    const parts = header.split('|');
    if (parts.length < 7) continue;
    const [hash, shortHash, parentRaw, refsRaw, date, author, authorEmail] = parts;
    const parentHashes = (parentRaw || '').split(' ').filter(Boolean);
    let branch = '';
    let tag: string | undefined;
    const refs = (refsRaw || '').split(', ');
    for (const r of refs) {
      if (r.startsWith('tag: ')) {
        tag = r.substring(5);
      } else if (r.startsWith('HEAD -> ')) {
        const headRef = r.substring(8);
        if (!headBranch) headBranch = headRef;
        if (!branch) { branch = headRef; branchSet.add(branch); }
      } else if (r) {
        if (!branch) branch = r;
        branchSet.add(r);
      }
    }
    for (const p of parentHashes) { edges.push({ from: hash, to: p }); }
    nodes.push({ hash, shortHash, parentHashes, branch, date, author, authorEmail, message, tag });
  }

  // Propagate branch names from children to parents
  const branchOf = new Map<string, string>();
  for (const n of nodes) {
    const node = n as { hash: string; branch: string };
    if (node.branch) branchOf.set(node.hash, node.branch);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      const e = edge as { from: string; to: string };
      if (!branchOf.has(e.to)) {
        const childBranch = branchOf.get(e.from);
        if (childBranch) {
          branchOf.set(e.to, childBranch);
          changed = true;
        }
      }
    }
  }
  for (const n of nodes) {
    const node = n as { hash: string; branch: string };
    if (!node.branch) {
      const propagated = branchOf.get(node.hash);
      if (propagated) node.branch = propagated;
    }
  }

  // Sort branches: HEAD branch first, local branches, remote refs, origin/HEAD last
  const sortedBranches = Array.from(branchSet).sort((a, b) => {
    if (a === headBranch) return -1;
    if (b === headBranch) return 1;
    if (a === 'origin/HEAD') return 1;
    if (b === 'origin/HEAD') return -1;
    const aIsRemote = a.startsWith('origin/') || a.startsWith('upstream/');
    const bIsRemote = b.startsWith('origin/') || b.startsWith('upstream/');
    if (aIsRemote && !bIsRemote) return 1;
    if (!aIsRemote && bIsRemote) return -1;
    return a.localeCompare(b);
  });

  const branchProgress = await computeBranchProgress(rootPath, sortedBranches);
  return { nodes, edges, branches: sortedBranches, branchProgress };
}

interface BranchProgress {
  ahead: number;
  behind: number;
  mergeBase?: string;
}

async function computeBranchProgress(
  rootPath: string,
  branches: string[],
): Promise<Record<string, BranchProgress>> {
  const result: Record<string, BranchProgress> = {};
  const tasks = branches
    .filter(b => !b.startsWith('origin/') && b !== 'HEAD')
    .map(async (branch) => {
      const remote = `origin/${branch}`;
      const remoteCheck = await runGit(rootPath, ['rev-parse', '--verify', remote]);
      if (!remoteCheck) {
        const count = (await runGit(rootPath, ['rev-list', '--count', branch, '--not', '--all'])) || '0';
        result[branch] = { ahead: parseInt(count.trim()) || 0, behind: 0 };
        return;
      }
      const [aheadRaw, behindRaw] = await Promise.all([
        runGit(rootPath, ['rev-list', '--count', `${remote}..${branch}`]),
        runGit(rootPath, ['rev-list', '--count', `${branch}..${remote}`]),
      ]);
      const mergeBase = (await runGit(rootPath, ['merge-base', branch, remote]))?.trim();
      result[branch] = {
        ahead: parseInt(aheadRaw?.trim() || '0') || 0,
        behind: parseInt(behindRaw?.trim() || '0') || 0,
        mergeBase: mergeBase || undefined,
      };
    });
  await Promise.all(tasks);
  return result;
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
