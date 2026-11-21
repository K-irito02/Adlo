export function normalizeUrlForCompare(url: string): string {
  try {
    const u = new URL(url);
    // 剥离 modal_id：SPA 中 base≡modal_id 同属一页（抖音等），否则 base 与
    // modal_id 变体被判为不同 URL，引发 urlChanged 误判/缓存 miss。
    if (u.searchParams.has('modal_id')) {
      const kept = [...u.searchParams.entries()].filter(([k]) => k !== 'modal_id');
      u.search = kept.length ? `?${new URLSearchParams(kept).toString()}` : '';
    }
    u.hash = '';
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }
    return u.toString();
  } catch {
    const noHash = url.split('#')[0] || url;
    if (noHash.length > 8 && noHash.endsWith('/')) {
      return noHash.replace(/\/+$/, '');
    }
    return noHash;
  }
}

/**
 * 显式导航的期望目标：`{url, at, tabId}`。
 * - `url`：用户显式导航的 URL（地址栏提交/书签历史树点击）
 * - `at`：设置时间戳，重定向检测据此做 10s 新鲜度门控
 * - `tabId`：发起导航的目标 tab id；`null` 表示"新建 tab"场景（发起时 tab 尚不存在）
 * 供 useBrowserUrlChange 检测跨域重定向（Chrome/Edge 重定向链消化语义）。
 */
export interface ExpectedNavigation {
  url: string;
  at: number;
  tabId: string | null;
}

export type ExpectedNavigationRef = React.MutableRefObject<ExpectedNavigation | null>;

export function isProbablySameSite(expected: string, actual: string): boolean {
  try {
    const expectedHost = new URL(expected).hostname;
    const actualHost = new URL(actual).hostname;
    if (expectedHost === actualHost) {
      return true;
    }
    const expectedParts = expectedHost.split('.');
    const actualParts = actualHost.split('.');
    if (expectedParts.length >= 2 && actualParts.length >= 2) {
      const expectedRoot = expectedParts.slice(-2).join('.');
      const actualRoot = actualParts.slice(-2).join('.');
      if (expectedRoot === actualRoot) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

import type { SearchEngine } from '../../stores/slices/browserSearchEnginesSlice';
import { historyDedupKey } from '@utils/browserDisplayUtils';

export type { SearchEngine } from '../../stores/slices/browserSearchEnginesSlice';

/**
 * 判断输入是否为搜索词（而非 URL）
 */
export function isSearchQuery(input: string): boolean {
  const trimmed = input.trim();
  // 已有协议 → 导航
  if (/^[a-z]+:\/\//i.test(trimmed)) {
    return false;
  }
  // about: 协议 → 导航
  if (/^about:/i.test(trimmed)) {
    return false;
  }
  // IP 地址 → 导航
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed)) {
    return false;
  }
  // localhost → 导航（$ 锚定，避免 localhostxyz 被误判为 URL）
  if (/^localhost(:\d+)?$/i.test(trimmed)) {
    return false;
  }
  // 含空格 → 搜索
  if (/\s/.test(trimmed)) {
    return true;
  }
  // 含中文 → 搜索
  if (/[\u4e00-\u9fff]/.test(trimmed)) {
    return true;
  }
  // 无点号 → 搜索
  if (!/\./.test(trimmed)) {
    return true;
  }
  // 其它按 URL 处理
  return false;
}

/**
 * 构建搜索 URL
 */
export function buildSearchUrl(engine: SearchEngine, query: string): string {
  return engine.urlTemplate.replace('%s', encodeURIComponent(query));
}

/**
 * 确保输入有协议前缀
 */
export function ensureProtocol(input: string): string {
  const trimmed = input.trim();
  if (/^[a-z]+:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^about:/i.test(trimmed)) {
    return trimmed;
  }
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return `file:///${trimmed.replace(/\\/g, '/')}`;
  }
  return `https://${trimmed}`;
}

/**
 * 修复历史持久化中的坏 URL：`https://c/Users/...` 这类“盘符被当成主机名”的地址
 * 会让 WebView2 在静默抓取/创建时卡死。与壳层 `silent_fetch_url_allowed` 同源：
 * - 仅盘符形态的单字母主机回落 about:blank（确证的坏模式）；
 * - 其余单标签主机（`http://nas/` 类内网）保留原 URL（只跳过静默抓取/预热，
 *   不改写标签，避免永久丢标签）；
 * - http(s) 之外的 scheme（file/about 等）与空串原样保留（空串即新建标签页，
 *   与 `about:blank` 同生命周期语义，见 useWebViewLifecycle）。
 */
export function sanitizeRestoredBrowserUrl(url: string): string {
  if (url === '') {
    return url;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return url;
    }
    const host = parsed.hostname;
    if (/^[a-z]$/i.test(host)) {
      return 'about:blank';
    }
    return url;
  } catch {
    return url;
  }
}

/**
 * 池事件归属判定（事项 13）：Rust 发出的是 browser-xxx 形态的标签 id（WebView
 * label 才带 adl-browser-view- 前缀）。未知 tabId（DSH 独立子窗口等非池
 * WebView）丢弃，避免其导航在面板创建幻影标签/劫持活动标签；无 tabId 走既有分支。
 */
export function isPoolTabEvent(
  tabId: string | undefined,
  tabs: Pick<{ id: string }, 'id'>[],
): boolean {
  if (!tabId) {
    return true;
  }
  return tabs.some((t) => t.id === tabId);
}

/**
 * 右侧面板地址栏同步归属：中心宿主承载的浏览器标签也会在池中触发导航事件，
 * 但那些事件不得覆盖面板地址栏。无法解析到标签时保持旧行为（放行）。
 */
export function shouldSyncPanelAddressForTab(tab?: { location?: 'panel' | 'center' }): boolean {
  return !tab || tab.location !== 'center';
}

export interface BrowserSearchItem {
  title: string;
  url: string;
}

export interface BrowserSearchResult extends BrowserSearchItem {
  source: string;
}

export type BrowserSearchScopeKind = 'bookmarks' | 'history' | 'all';

export function filterBrowserItems<T extends BrowserSearchItem>(items: T[], query: string): T[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return items;
  }
  return items.filter((item) => {
    const title = item.title.toLowerCase();
    const url = item.url.toLowerCase();
    return title.includes(normalizedQuery) || url.includes(normalizedQuery);
  });
}

/**
 * 搜索标签结果合并（事项 10-c）：空查询直接返回空（点域按钮不再默认列出全域）；
 * '全部'域跨源按 URL 去重——高优先级先行占位（已打开 > 收藏 > 历史），
 * 行操作锚定最鲜活的归属，展示顺序同样最可操作的在前。
 */
export function mergeSearchResults(args: {
  query: string;
  scope: BrowserSearchScopeKind;
  bookmarks: BrowserSearchItem[];
  history: BrowserSearchItem[];
  openTabs: BrowserSearchItem[];
  labels: { savedTabs: string; historyTabs: string; openTabs: string };
}): BrowserSearchResult[] {
  const { query, scope, bookmarks, history, openTabs, labels } = args;
  // 空查询不再默认列出全域标签：仅输入后出结果。
  if (!query.trim()) {
    return [];
  }
  const filteredBookmarks = filterBrowserItems(bookmarks, query);
  const filteredHistory = filterBrowserItems(history, query);
  const filteredOpenTabs = filterBrowserItems(openTabs, query);
  if (scope === 'bookmarks') {
    return filteredBookmarks.map((item) => ({ ...item, source: labels.savedTabs }));
  }
  if (scope === 'history') {
    return filteredHistory.map((item) => ({ ...item, source: labels.historyTabs }));
  }
  const merged = new Map<string, BrowserSearchResult>();
  const put = (item: BrowserSearchItem, source: string) => {
    const key = `url:${historyDedupKey(item.url)}`;
    if (!merged.has(key)) {
      merged.set(key, { ...item, source });
    }
  };
  // 已打开标签同样参与"全部"检索：此前仅合并且收藏/历史，输入标签标题/网址时无结果。
  for (const item of filteredOpenTabs) {
    put(item, labels.openTabs);
  }
  for (const item of filteredBookmarks) {
    put(item, labels.savedTabs);
  }
  for (const item of filteredHistory) {
    put(item, labels.historyTabs);
  }
  return [...merged.values()];
}

/**
 * 从搜索结果 URL 中提取用户查询文本。
 * 匹配已知搜索引擎的 URL 模板，返回解码后的查询词；
 * 非搜索 URL 返回空字符串。
 */
export function extractSearchQueryFromUrl(url: string, engines: SearchEngine[]): string {
  try {
    const u = new URL(url);
    for (const engine of engines) {
      try {
        const tpl = new URL(engine.urlTemplate.replace('%s', '___PLACEHOLDER___'));
        if (u.hostname !== tpl.hostname) {
          continue;
        }
        const paramName = [...tpl.searchParams.keys()].find(
          (k) => tpl.searchParams.get(k) === '___PLACEHOLDER___',
        );
        if (!paramName) {
          continue;
        }
        const raw = u.searchParams.get(paramName);
        if (raw) {
          // `URLSearchParams.get` 已经解码一次；再 decodeURIComponent 会把字面量
          // `%20` 二次解码、查询含孤立 `%`（如「50% off」）时抛 URIError 被吞掉。
          return raw;
        }
      } catch {
        // 跳过无效模板
      }
    }
  } catch {
    // 无效 URL
  }
  return '';
}
