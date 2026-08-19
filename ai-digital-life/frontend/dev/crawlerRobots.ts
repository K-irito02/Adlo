/**
 * robots.txt 解析与匹配（RFC 9309 子集）——纯函数，无 I/O。
 * 仅预览端本地抓取路径使用（桌面端静默 WebView2 渲染不经过 robots 门控）。
 */

export interface RobotsGroup {
  userAgents: string[];
  allow: string[];
  disallow: string[];
}

export interface RobotsRules {
  groups: RobotsGroup[];
}

export function productToken(userAgent: string): string {
  return userAgent.split('/')[0] ?? userAgent;
}

export function parseRobotsTxt(raw: string): RobotsRules {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;

  for (const rawLine of raw.split('\n')) {
    const line = (rawLine.split('#')[0] ?? '').trim();
    if (!line) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const field = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();
    if (field === 'user-agent') {
      const hasRules =
        current !== null && (current.allow.length > 0 || current.disallow.length > 0);
      if (hasRules) {
        groups.push(current!);
        current = null;
      }
      if (!current) {
        current = { userAgents: [], allow: [], disallow: [] };
      }
      current.userAgents.push(value);
    } else if (field === 'allow' && value) {
      if (!current) current = { userAgents: ['*'], allow: [], disallow: [] };
      current.allow.push(value);
    } else if (field === 'disallow' && value) {
      if (!current) current = { userAgents: ['*'], allow: [], disallow: [] };
      current.disallow.push(value);
    }
  }
  if (current) groups.push(current);
  return { groups };
}

export function isAllowed(rules: RobotsRules, userAgent: string, path: string): boolean {
  const token = productToken(userAgent).trim();
  const group =
    rules.groups.find((g) => g.userAgents.some((ua) => ua.toLowerCase() === token.toLowerCase())) ??
    rules.groups.find((g) => g.userAgents.some((ua) => ua === '*'));
  if (!group) return true;
  const p = path.length ? path : '/';
  const allowLen = group.allow
    .map((pat) => longestMatch(pat, p))
    .filter((n): n is number => n !== null);
  const disallowLen = group.disallow
    .map((pat) => longestMatch(pat, p))
    .filter((n): n is number => n !== null);
  const aMax = allowLen.length ? Math.max(...allowLen) : null;
  const dMax = disallowLen.length ? Math.max(...disallowLen) : null;
  if (aMax === null && dMax === null) return true;
  if (aMax === null) return false;
  if (dMax === null) return true;
  return aMax >= dMax;
}

export function longestMatch(pattern: string, path: string): number | null {
  const anchored = pattern.endsWith('$');
  const core = anchored ? pattern.slice(0, -1) : pattern;
  const p = core.split('');
  const s = path.split('');
  const dp: boolean[][] = Array.from({ length: p.length + 1 }, () =>
    Array(s.length + 1).fill(false),
  );
  dp[0][0] = true;
  for (let i = 1; i <= p.length; i++) {
    if (p[i - 1] === '*') {
      for (let j = 0; j <= s.length; j++) {
        if (dp[i - 1][j]) dp[i][j] = true;
      }
      for (let j = 1; j <= s.length; j++) {
        if (dp[i][j - 1]) dp[i][j] = true;
      }
    } else {
      for (let j = 1; j <= s.length; j++) {
        if (dp[i - 1][j - 1] && p[i - 1] === s[j - 1]) dp[i][j] = true;
      }
    }
  }
  if (anchored) {
    return dp[p.length][s.length] ? s.length : null;
  }
  for (let j = s.length; j >= 0; j--) {
    if (dp[p.length][j]) return j;
  }
  return null;
}
