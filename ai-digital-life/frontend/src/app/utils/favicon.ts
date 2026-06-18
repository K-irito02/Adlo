import { getCachedFavicon } from './fetchPageMeta';

const GOOGLE_FAVICON = 'https://www.google.com/s2/favicons?domain={domain}&sz=64';

export function getFaviconUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    const cached = getCachedFavicon(url);
    if (cached) {
      return cached;
    }

    if (hostname === 'localhost' || /^127\./.test(hostname) || /^192\.168\./.test(hostname)) {
      return '';
    }

    return GOOGLE_FAVICON.replace('{domain}', hostname);
  } catch {
    return '';
  }
}
