import { getCanonicalOriginFavicon, persistFaviconDataUri } from './siteMetaCache';

/**
 * 站点级 favicon（Chrome/Edge 式：每个站点一个唯一 favicon）。
 *
 * 修复：不再做"精确 URL → origin 回落"的两级切换——否则同站不同 URL（如抖音
 * 首页 vs 带 `?modal_id=` 的视频页）会各自命中不同真实 favicon，造成同站出现
 * 两种真实图标并来回切换。改为按 origin 确定性选取一个 canonical 图标（优先站点
 * 根条目的图标），所有同站 URL 显示一致。无则返回 ''（组件显示"站点首字母"兜底）。
 */

/**
 * Module-level preload cache: external favicon URLs → data-URIs.
 * Once an external favicon is loaded via the hidden <img>, its data-URI is cached
 * here so subsequent calls return instantly (no network request).
 * Mirrors Chrome's approach: fetch once, serve from persistent cache forever.
 */
const preloadCache = new Map<string, string>();

/**
 * 预加载外部 favicon 并转换为 data-URI（Chrome/Edge 式持久缓存）：
 * 1. 用 <img> 加载外部 favicon（走浏览器缓存，跨会话可用）
 * 2. canvas 读取像素 → 转 data-URI
 * 3. 存入内存 preloadCache（本次会话内秒显示）
 * 4. **写回 SQLite 持久层**（restart 后 initSiteMetaCache 水合直接命中，无需网络）
 *
 * 传 `cacheKey`：外部 favicon 属于哪个页面 URL（canonical origin entry 的键），
 * data-URI 必须写回该键才能让同站所有 URL 命中。
 */
function preloadExternalFavicon(faviconUrl: string, cacheKey: string): void {
  if (preloadCache.has(faviconUrl)) return;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const canvas = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      canvas.convertToBlob({ type: 'image/png' }).then((blob) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUri = reader.result as string;
          preloadCache.set(faviconUrl, dataUri);
          console.info(
            `[ADL-FAVICON-PRELOAD] converted: ${faviconUrl.slice(0, 80)} → data-URI (${dataUri.length} chars)`,
          );
          // Chrome/Edge 式持久化：写回 SQLite，restart 后直接命中。
          if (cacheKey) {
            void persistFaviconDataUri(cacheKey, dataUri);
          }
        };
        reader.readAsDataURL(blob);
      });
    } catch {
      // Canvas tainted or other error — skip silently
    }
  };
  img.src = faviconUrl;
}

/**
 * 站点级 favicon URL（data-URI 优先，无 data-URI 时返回空字符串触发兜底字母）。
 *
 * Chrome/Edge 策略：
 * 1. 优先返回已缓存的 data-URI（立即可用，无网络请求）
 * 2. 若无 data-URI，返回空字符串（组件显示"站点首字母"兜底）
 *    后台预加载外部 favicon → data-URI 落地后下次调用直接返回
 */
export function getFaviconUrl(url: string): string {
  const { faviconDataUri, faviconUrl, cacheKey } = getCanonicalOriginFavicon(url);

  // 优先级 1：内存缓存中已有 data-URI
  if (faviconDataUri) return faviconDataUri;

  // 优先级 2：模块级预加载缓存中已有 data-URI
  if (faviconUrl && preloadCache.has(faviconUrl)) {
    return preloadCache.get(faviconUrl)!;
  }

  // 优先级 3：外部 URL —— 后台预加载为 data-URI，但不返回外部 URL
  // （外部 URL 会导致子面板切换时 favicon 消失，只保留 data-URI 或兜底字母）
  if (faviconUrl && faviconUrl.startsWith('http')) {
    preloadExternalFavicon(faviconUrl, cacheKey);
  }

  // 无 data-URI 时返回空字符串，组件显示兜底字母
  return faviconDataUri || '';
}
