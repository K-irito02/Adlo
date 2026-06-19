const PAGE_META_TTL = 5 * 60 * 1000;

interface CacheEntry {
  title: string;
  favicon: string;
  url: string;
  fetchedAt: number;
}

const metaCache = new Map<string, CacheEntry>();
const faviconUrlCache = new Map<string, string>();

export function getCachedFavicon(url: string): string | undefined {
  return faviconUrlCache.get(url);
}

export function setCachedFavicon(url: string, favicon: string): void {
  if (faviconUrlCache.size > 200) {
    const firstKey = faviconUrlCache.keys().next().value;
    if (firstKey) {
      faviconUrlCache.delete(firstKey);
    }
  }
  faviconUrlCache.set(url, favicon);
}

export async function fetchPageMeta(
  url: string
): Promise<{ title: string; favicon: string } | null> {
  const cached = metaCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < PAGE_META_TTL) {
    return { title: cached.title, favicon: cached.favicon };
  }

  try {
    const res = await fetch(
      `/__adl_preview_api__/browser/page-meta?url=${encodeURIComponent(url)}`
    );
    if (!res.ok) {
      return null;
    }
    const data: { title: string; favicon: string; url: string } = await res.json();

    if (metaCache.size > 100) {
      const firstKey = metaCache.keys().next().value;
      if (firstKey) {
        metaCache.delete(firstKey);
      }
    }
    metaCache.set(url, { ...data, fetchedAt: Date.now() });

    if (data.favicon) {
      setCachedFavicon(url, data.favicon);
    }

    return { title: data.title, favicon: data.favicon };
  } catch {
    return null;
  }
}
