import type { AgentSiteAllowEntry } from './ipc-types.generated';

/** 归一单个白名单行到 origin（`scheme://host[:port]`）。非 http/https 或无 host → null。 */
export function normalizeOrigin(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  if (!url.host) {
    return null;
  }
  return url.origin;
}

/** 结构化白名单归一：别名去空白（空即省略），站点归一为 origin，去重保序。
 * 兼容裸字符串条目（手写配置/旧形状残留）：视为无别称条目归一，避免展示层丢数据。 */
export function normalizeAgentSiteEntries(value: unknown): AgentSiteAllowEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries: AgentSiteAllowEntry[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item === 'string') {
      const origin = normalizeOrigin(item);
      if (!origin || seen.has(origin)) {
        continue;
      }
      seen.add(origin);
      entries.push({ origin });
      continue;
    }
    if (!item || typeof item !== 'object') {
      continue;
    }
    const origin = normalizeOrigin(String((item as Partial<AgentSiteAllowEntry>).origin ?? ''));
    if (!origin || seen.has(origin)) {
      continue;
    }
    seen.add(origin);
    const alias = String((item as Partial<AgentSiteAllowEntry>).alias ?? '').trim();
    entries.push(alias ? { alias, origin } : { origin });
  }
  return entries;
}

/** 白名单条目取 origin 列表（注入脚本/命令只需要 origin，不含别称）。 */
export function allowlistOrigins(entries: readonly AgentSiteAllowEntry[]): string[] {
  return entries.map((entry) => entry.origin);
}
