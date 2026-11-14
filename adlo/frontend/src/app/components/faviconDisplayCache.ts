/**
 * 已成功渲染过的 favicon 来源缓存（会话级）。
 *
 * 书签目录/列表切换、折叠展开、标签栏重排通常会**卸载再挂载**图标组件。若加载状态
 * 只存在组件内，重挂时可能先画一帧兜底首字母，等 `<img>` 再次解码后才换成真实
 * 图标——用户反复展开目录时看到的就是「兜底图标 ↔ 真实图标」持续闪烁
 * （2026-11-15 用户报告）。
 *
 * 因此把「哪个 src 已经成功显示过」提升到模块级：重挂时可直接渲染真实图标。
 * 内联 data-URI 本身可同步显示，也视为就绪（导入书签的 ICON 快照即走这条）。
 */
const MAX_TRACKED_SOURCES = 4000;
const loadedSources = new Set<string>();
const failedSources = new Set<string>();
/**
 * 页面 URL → 最近一次**成功显示**的图标来源。
 *
 * 同一书签在折叠/展开、目录↔列表切换时会反复重挂；只记「src 是否加载过」仍可能
 * 因为 remount 时 `getFaviconUrl()` 暂时返回不同/空值而退回占位。按页面记住最终
 * 显示过的来源后，重挂首帧就能直接复用（用户 2026-11-15 指出单个书签每次都从
 * 无图标变真实图标）。
 */
const pageDisplaySources = new Map<string, string>();

function isInlineFaviconSource(src: string): boolean {
  return /^data:image\//i.test(src.trim());
}

/** src 是否可在挂载当帧直接显示（已成功加载过，或未失败过的内联 data-URI）。 */
export function isFaviconSourceReady(src: string): boolean {
  if (!src) {
    return false;
  }
  if (failedSources.has(src)) {
    return false;
  }
  return isInlineFaviconSource(src) || loadedSources.has(src);
}

export function markFaviconSourceLoaded(src: string): void {
  if (!src) {
    return;
  }
  failedSources.delete(src);
  if (loadedSources.size >= MAX_TRACKED_SOURCES && !loadedSources.has(src)) {
    const oldest = loadedSources.values().next().value as string | undefined;
    if (oldest !== undefined) {
      loadedSources.delete(oldest);
    }
  }
  loadedSources.add(src);
}

/**
 * 标记来源加载失败。内联 data-URI 失败（损坏数据）会一直失败，因此需要持久记住；
 * 外部 URL 的失败仍可在下次挂载重试（`isFaviconSourceReady` 本就不含未加载过的 URL）。
 */
export function markFaviconSourceFailed(src: string): void {
  if (!src) {
    return;
  }
  loadedSources.delete(src);
  if (failedSources.size >= MAX_TRACKED_SOURCES) {
    const oldest = failedSources.values().next().value as string | undefined;
    if (oldest !== undefined) {
      failedSources.delete(oldest);
    }
  }
  failedSources.add(src);
}

export function rememberPageFavicon(pageUrl: string, src: string): void {
  if (!pageUrl || !src) {
    return;
  }
  if (pageDisplaySources.size >= MAX_TRACKED_SOURCES && !pageDisplaySources.has(pageUrl)) {
    const oldest = pageDisplaySources.keys().next().value as string | undefined;
    if (oldest !== undefined) {
      pageDisplaySources.delete(oldest);
    }
  }
  pageDisplaySources.set(pageUrl, src);
}

export function getRememberedPageFavicon(pageUrl: string): string {
  return pageUrl ? (pageDisplaySources.get(pageUrl) ?? '') : '';
}

export function forgetPageFavicon(pageUrl: string, src: string): void {
  if (pageUrl && pageDisplaySources.get(pageUrl) === src) {
    pageDisplaySources.delete(pageUrl);
  }
}

export function __resetFaviconDisplayCacheForTest(): void {
  loadedSources.clear();
  failedSources.clear();
  pageDisplaySources.clear();
}
