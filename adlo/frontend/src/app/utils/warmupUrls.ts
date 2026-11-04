import { useAppStore } from '@stores/slicedStore';
import { sanitizeRestoredBrowserUrl } from '@features/browser/browserUrlUtils';
import { normalizeUrlForCache } from './siteMetaCache';

/**
 * 静默抓取只对合规 URL 有意义：盘符伪主机（如坏持久化产生的 https://c/...）
 * 会让 WebView2 创建卡死，直接跳过（与 sanitizeRestoredBrowserUrl 同源；
 * 单标签内网主机保留给标签页，预热侧由壳层白名单二次拦截，不建 WebView）。
 */
function isMetaFetchableUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    return sanitizeRestoredBrowserUrl(value) === value;
  } catch {
    return false;
  }
}

/**
 * 启动预热：收集可见 URL（打开标签 + 全局书签 + 工作区书签 + 历史记录前 500 条），
 * 按 normalizeUrlForCache 去重并限制数量，供 pageMetaClient.warmup 批量预取，
 * 消除首屏图标/标题延迟。
 */
export function collectWarmupUrls(limit = 200): string[] {
  const s = useAppStore.getState();
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (u: string | undefined) => {
    if (!u || !/^https?:\/\//.test(u) || !isMetaFetchableUrl(u)) {
      return;
    }
    const key = normalizeUrlForCache(u);
    if (!seen.has(key) && out.length < limit) {
      seen.add(key);
      out.push(u);
    }
  };
  s.browserTabs.forEach((t) => push(t.url));
  s.browserBookmarks.forEach((b) => push(b.url));
  Object.values(s.browserWorkspaceBookmarks).forEach((es) => es.forEach((e) => push(e.url)));
  s.browserHistory.slice(0, 500).forEach((h) => push(h.url));
  return out;
}
