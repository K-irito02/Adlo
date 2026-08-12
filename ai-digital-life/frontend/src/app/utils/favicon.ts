import { getCachedFavicon, getCachedSiteMeta } from './siteMetaCache';

const GOOGLE_FAVICON_API = 'https://www.google.com/s2/favicons';
const GOOGLE_FAVICON = `${GOOGLE_FAVICON_API}?domain={domain}&sz=64`;

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

    if (hostname === 'localhost' || /^127\./.test(hostname) || /^192\.168\./.test(hostname)) {
      return '';
    }
    return GOOGLE_FAVICON.replace('{domain}', hostname);
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
