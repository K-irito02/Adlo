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
 * Normalize URL for history dedup — matches by hostname+pathname,
 * ignoring query params, hash, trailing slash, and www. prefix.
 * This prevents duplicate entries when the same page is visited
 * with different tracking parameters or URL variants.
 */
export function historyDedupKey(url: string): string {
  try {
    const u = new URL(url);
    const hostname = u.hostname.replace(/^www\./, '');
    const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : u.pathname;
    return `${hostname}${path}`;
  } catch {
    return url;
  }
}
