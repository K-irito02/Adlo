import type { SiteMetaBackend, SiteMetaCacheEntry } from './types';

export function createMockSiteMetaBackend(): SiteMetaBackend {
  const store = new Map<string, SiteMetaCacheEntry>();
  return {
    getAll: async () => Object.fromEntries(store.entries()),
    upsert: async (entries) => {
      for (const [url, entry] of Object.entries(entries)) store.set(url, entry);
    },
    remove: async (urls) => {
      for (const url of urls) store.delete(url);
    },
    clear: async () => store.clear(),
  };
}
