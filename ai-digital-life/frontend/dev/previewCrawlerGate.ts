// previewCrawlerGate.ts —— 供 vite.config.ts page-meta 中间件使用
import { isPrivateUrl, robotsAllowFetch } from './crawlerPolicy';

/**
 * 返回 true 表示允许继续抓取。用于 page-meta 中间件的 HTML 与 favicon 两处门控。
 * fetchImpl/now 便于测试注入。
 */
export async function pageMetaGateAllows(
  url: string,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<boolean> {
  return robotsAllowFetch(url, fetchImpl, now);
}
