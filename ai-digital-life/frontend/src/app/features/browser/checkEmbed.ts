const checkCache = new Map<string, boolean>();

export function isEmbedBlocked(url: string): boolean | undefined {
  return checkCache.get(url);
}

export async function checkEmbed(url: string): Promise<boolean> {
  const cached = isEmbedBlocked(url);
  if (cached !== undefined) {
    return cached;
  }
  try {
    const embedOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    const res = await fetch(
      `/__adl_preview_api__/browser/check-embed?url=${encodeURIComponent(url)}&embedOrigin=${encodeURIComponent(embedOrigin)}`
    );
    const data = await res.json();
    const blocked = data.blocked === true;
    if (checkCache.size > 50) {
      const firstKey = checkCache.keys().next().value;
      if (firstKey !== undefined) {
        checkCache.delete(firstKey);
      }
    }
    checkCache.set(url, blocked);
    return blocked;
  } catch {
    return true;
  }
}
