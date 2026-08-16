import { getCachedFavicon, getCachedSiteMeta } from './siteMetaCache';

const GOOGLE_FAVICON_API = 'https://www.google.com/s2/favicons';
const GOOGLE_FAVICON = `${GOOGLE_FAVICON_API}?domain={domain}&sz=64`;
const DDG_FAVICON = 'https://icons.duckduckgo.com/ip3/{domain}.png';

export function getFaviconUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    const dataUri = getCachedFavicon(url);
    if (dataUri) {
      return dataUri;
    }

    const entry = getCachedSiteMeta(url);
    if (entry?.faviconUrl) {
      return entry.faviconUrl;
    }

    // 私网地址跳过外部兜底
    if (hostname === 'localhost' || /^127\./.test(hostname) || /^192\.168\./.test(hostname)) {
      return '';
    }
    // 外部兜底链：DDG（优先）→ Google S2（getGoogleFaviconUrl 显式兜底）→ ''
    return DDG_FAVICON.replace('{domain}', hostname);
  } catch {
    return '';
  }
}

export function getGoogleFaviconUrl(url: string | undefined): string {
  if (!url) {
    return '';
  }
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    if (hostname === 'localhost' || /^127\./.test(hostname) || /^192\.168\./.test(hostname)) {
      return '';
    }
    return GOOGLE_FAVICON.replace('{domain}', hostname);
  } catch {
    return '';
  }
}
