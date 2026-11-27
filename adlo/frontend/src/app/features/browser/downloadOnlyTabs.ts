/**
 * 标签页被导航到下载 URL 的会话级标记（transient，不持久化）。
 *
 * 下载导航不会触发 `browser-page-ready`；标签的 WebView 必须保持屏外（不揭示空白
 * 下载页），加载态也不能等 12s 兜底。由 `useWebViewLifecycle` 在收到该标签的下载
 * 记录时打标并清除加载态，`useWebViewBounds` 据此跳过边界应用；下载终止后自动关
 * 标签并清标。
 */
const downloadOnlyTabs = new Set<string>();

export function markDownloadOnlyTab(tabId: string): void {
  downloadOnlyTabs.add(tabId);
}

export function unmarkDownloadOnlyTab(tabId: string): void {
  downloadOnlyTabs.delete(tabId);
}

export function isDownloadOnlyTab(tabId: string): boolean {
  return downloadOnlyTabs.has(tabId);
}

/** 当前所有下载导航标签（供跨标签的终止态清理遍历）。 */
export function downloadOnlyTabIds(): string[] {
  return [...downloadOnlyTabs];
}

/** 标签已被关闭时清掉标记，避免集合随会话增长。 */
export function pruneDownloadOnlyTabs(liveTabIds: ReadonlySet<string>): void {
  for (const tabId of downloadOnlyTabs) {
    if (!liveTabIds.has(tabId)) {
      downloadOnlyTabs.delete(tabId);
      downloadSourceByTab.delete(tabId);
    }
  }
}

/**
 * 新窗口标签 → 发起请求的来源标签。下载开始后前端据此把焦点切回来源页，
 * 让下载标签留在后台（不再停留在一个空白的活动标签上）。
 */
const downloadSourceByTab = new Map<string, string>();

export function rememberDownloadSource(downloadTabId: string, sourceTabId: string): void {
  downloadSourceByTab.set(downloadTabId, sourceTabId);
}

export function consumeDownloadSource(downloadTabId: string): string | undefined {
  const source = downloadSourceByTab.get(downloadTabId);
  downloadSourceByTab.delete(downloadTabId);
  return source;
}

/** 测试专用：清空标记。生产代码不得调用。 */
export function resetDownloadOnlyTabsForTest(): void {
  downloadOnlyTabs.clear();
  downloadSourceByTab.clear();
}
