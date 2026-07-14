export function hostnameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') || url;
  } catch {
    return '';
  }
}

export function normalizeTabTitle(title: string | undefined, _url: string): string {
  if (title && !/^https?:\/\//.test(title)) {
    return title;
  }
  return '';
}

/**
 * Normalize URL for history dedup — matches by hostname+pathname+query string,
 * ignoring hash, trailing slash, and www. prefix.
 * Query string is included so SPA pages with different query params (e.g. YouTube
 * `?v=AAA` vs `?v=BBB`) get separate history entries.
 */
export function historyDedupKey(url: string): string {
  try {
    const u = new URL(url);
    const hostname = u.hostname.replace(/^www\./, '');
    const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : u.pathname;
    const query = u.search || '';
    return `${hostname}${path}${query}`;
  } catch {
    return url;
  }
}
