import { getCanonicalOriginFavicon } from './siteMetaCache';

/**
 * 站点级 favicon（Chrome/Edge 式：每个站点一个唯一 favicon）。
 *
 * 修复：不再做"精确 URL → origin 回落"的两级切换——否则同站不同 URL（如抖音
 * 首页 vs 带 `?modal_id=` 的视频页）会各自命中不同真实 favicon，造成同站出现
 * 两种真实图标并来回切换。改为按 origin 确定性选取一个 canonical 图标（优先站点
 * 根条目的图标），所有同站 URL 显示一致。无则返回 ''（组件显示"站点首字母"兜底）。
 */
export function getFaviconUrl(url: string): string {
  const { faviconDataUri, faviconUrl } = getCanonicalOriginFavicon(url);
  return faviconDataUri || faviconUrl;
}
