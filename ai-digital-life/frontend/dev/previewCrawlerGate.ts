// previewCrawlerGate.ts —— 供 vite.config.ts page-meta 中间件使用
import { isPrivateUrl, robotsAllowFetch, domainOf, DomainRateLimiter } from './crawlerPolicy';

/**
 * 单例限速器，跨请求共享（对应 Rust `crates/browser/src/browser.rs` 的 `OnceLock` 静态限速器）。
 * 窗口 5s，与 `fetch_page_meta_inner` 的 `RATE_LIMIT_WINDOW` 语义一致。
 */
const rateLimiter = new DomainRateLimiter(5000);

export interface PageMetaGateOptions {
  /**
   * 是否对公有域名应用单例限速器。默认 true。
   * favicon 门控必须传 false —— 与 Rust `fetch_page_meta_inner` 一致：
   * 该端对 favicon 仅做 `robots_allow_fetch` 门控、不参与限速，否则 HTML 门控
   * 刚为同一域名扣减过令牌，紧随其后的同源 favicon 会被确定性限速击穿。
   */
  rateLimit?: boolean;
}

/**
 * 返回 true 表示允许继续抓取。用于 page-meta 中间件的 HTML 与 favicon 两处门控。
 * robots 门控与私网豁免先行；公有域名默认再经单例限速器限速
 * （`opts.rateLimit: false` 时为 robots-only 路径，用于 favicon 门控）。
 * fetchImpl/now 便于测试注入。
 */
export async function pageMetaGateAllows(
  url: string,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
  opts: PageMetaGateOptions = {},
): Promise<boolean> {
  const { rateLimit = true } = opts;
  // robots 门控 + 私网豁免（robotsAllowFetch 内私网直接放行，不消费任何资源）
  if (!(await robotsAllowFetch(url, fetchImpl, now))) return false;
  // 私网 URL 豁免限速；仅公有域名进入限速器
  if (isPrivateUrl(url)) return true;
  if (!rateLimit) return true;
  const domain = domainOf(url);
  if (domain && !rateLimiter.tryAcquire(domain, now)) return false;
  return true;
}
