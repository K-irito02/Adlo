import { getCachedFavicon, getCachedSiteMeta } from './siteMetaCache';

/**
 * 仅返回缓存的真实图标：data-URI 优先，其次 favicon URL；无缓存返回 ''。
 * 不再使用 DDG / Google S2 代理图标兜底（Fix C/D）——代理服务对无收录
 * 域名返回默认地球图标且被墙/不稳定，误用会让用户看到与真实 favicon
 * 不一致的图标；未缓存时展示内置占位图标，等待后端抓取广播真实数据。
 */
export function getFaviconUrl(url: string): string {
  const dataUri = getCachedFavicon(url);
  if (dataUri) {
    return dataUri;
  }
  return getCachedSiteMeta(url)?.faviconUrl ?? '';
}
