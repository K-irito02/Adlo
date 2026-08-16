export interface SiteMetaCacheEntry {
  title: string;
  titleSource: string;
  faviconUrl: string;
  faviconDataUri: string;
  fetchedAt: number;
  lastOkAt: number;
  nextRetryAt: number;
  failCount: number;
}

export interface SiteMetaBackend {
  getAll(): Promise<Record<string, SiteMetaCacheEntry>>;
  upsert(entries: Record<string, SiteMetaCacheEntry>): Promise<void>;
  remove(urls: string[]): Promise<void>;
  clear(): Promise<void>;
}
