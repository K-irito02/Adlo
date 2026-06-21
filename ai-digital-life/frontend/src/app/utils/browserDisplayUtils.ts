export function hostnameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') || url;
  } catch {
    return '';
  }
}

export function normalizeTabTitle(title: string | undefined, url: string): string {
  if (title && !/^https?:\/\//.test(title)) {
    return title;
  }
  return hostnameFromUrl(url) || title || url || '';
}
