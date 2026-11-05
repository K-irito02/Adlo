/**
 * 爬虫策略：私网判定、robots 缓存、域名限速、robots 门控决策。
 * 仅预览端本地抓取路径使用（桌面端静默 WebView2 渲染不经过该策略）。
 * 供 `vite.config.ts` `/__adl_preview_api__/browser/page-meta` 中间件使用。
 */
import { parseRobotsTxt, isAllowed, type RobotsRules } from './crawlerRobots';
import { USER_AGENT, BOT_PRODUCT_TOKEN } from '../src/shared/userAgent';

declare global {
  var __adlRobotsCache: RobotsCache | undefined;
}

export const robotsCacheTtlMs = 3600_000;

export function isPrivateUrl(urlStr: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(urlStr).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return true;
  }
  if (hostname === 'localhost' || hostname === '::1') return true;
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 0 || a === 127 || a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}

export function domainOf(urlStr: string): string | null {
  try {
    return new URL(urlStr).hostname;
  } catch {
    return null;
  }
}

export class RobotsCache {
  private entries = new Map<string, { fetchedAt: number; rules: RobotsRules }>();

  get(domain: string, now: number): RobotsRules | null {
    const entry = this.entries.get(domain);
    if (!entry) return null;
    if (now - entry.fetchedAt >= robotsCacheTtlMs) return null;
    return entry.rules;
  }

  insert(domain: string, rules: RobotsRules, now: number): void {
    this.entries.set(domain, { fetchedAt: now, rules });
  }
}

export class DomainRateLimiter {
  private lastAllowed = new Map<string, number>();
  constructor(private readonly windowMs: number) {}

  tryAcquire(domain: string, now: number): boolean {
    const prev = this.lastAllowed.get(domain);
    if (prev !== undefined && now - prev < this.windowMs) return false;
    this.lastAllowed.set(domain, now);
    return true;
  }
}

/**
 * robots 门控（含私网豁免与 fail-open）。返回 true 表示允许抓取。
 * `now` 参数便于测试注入时间；生产调用省略。
 */
export async function robotsAllowFetch(
  urlStr: string,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<boolean> {
  if (isPrivateUrl(urlStr)) return true;
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return true;
  }
  const domain = parsed.hostname;
  const cache = globalThis.__adlRobotsCache ?? (globalThis.__adlRobotsCache = new RobotsCache());
  const cached = cache.get(domain, now);
  let rules: RobotsRules | null;
  if (cached) {
    rules = cached;
  } else {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let fetched: Response | null = null;
    try {
      fetched = await fetchImpl(`${parsed.protocol}//${domain}/robots.txt`, {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT },
      });
    } catch {
      fetched = null;
    } finally {
      clearTimeout(timeout);
    }
    if (fetched && fetched.ok) {
      const body = await fetched.text().catch(() => '');
      rules = body ? parseRobotsTxt(body) : null;
    } else {
      rules = null;
    }
    if (rules) cache.insert(domain, rules, now);
  }
  if (!rules) return true;
  return isAllowed(rules, BOT_PRODUCT_TOKEN, parsed.pathname);
}
