export interface SiteMetaCacheEntry {
  title: string;
  faviconUrl: string;
  faviconDataUri: string;
  fetchedAt: number;
}

export interface SiteMetaBackend {
  getAll(): Promise<Record<string, SiteMetaCacheEntry>>;
  upsert(entries: Record<string, SiteMetaCacheEntry>): Promise<void>;
  remove(urls: string[]): Promise<void>;
  clear(): Promise<void>;
}
