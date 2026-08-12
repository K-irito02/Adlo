import { useAppStore } from '@stores/slicedStore';
import { removeCachedSiteMeta, normalizeUrlForCache } from '@utils/siteMetaCache';

function isUrlReferenced(url: string): boolean {
  const s = useAppStore.getState();
  const key = normalizeUrlForCache(url);
  const urlMatches = (u: string | undefined) => !!u && normalizeUrlForCache(u) === key;

  return (
    s.browserTabs.some((t) => urlMatches(t.url)) ||
    s.browserBookmarks.some((b) => urlMatches(b.url)) ||
    Object.values(s.browserWorkspaceBookmarks).some((entries) =>
      entries.some((e) => urlMatches(e.url)),
    ) ||
    s.browserTabFolders.some((f) => (f.tabs ?? []).some((item) => urlMatches(item.url))) ||
    s.browserHistory.some((h) => urlMatches(h.url))
  );
}

export function removeSiteMetaIfUnreferenced(url: string): void {
  if (!url) return;
  if (!isUrlReferenced(url)) {
    removeCachedSiteMeta(url);
  }
}
