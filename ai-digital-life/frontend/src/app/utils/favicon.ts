import {
  getCachedFavicon,
  getCachedSiteMeta,
  getOriginFaviconDataUri,
  getOriginFaviconUrl,
} from './siteMetaCache';

/**
 * 分级兜底阶梯（Chrome/Edge 式）：
 * L1 精确 URL data-URI → L1b 精确 URL faviconUrl → L2 同 origin data-URI →
 * L2b 同 origin faviconUrl → ''（组件据此显示"站点首字母"兜底）。
 */
export function getFaviconUrl(url: string): string {
  const dataUri = getCachedFavicon(url);
  if (dataUri) {
    return dataUri;
  }
  const exact = getCachedSiteMeta(url)?.faviconUrl;
  if (exact) {
    return exact;
  }
  const originDataUri = getOriginFaviconDataUri(url);
  if (originDataUri) {
    return originDataUri;
  }
  return getOriginFaviconUrl(url);
}
