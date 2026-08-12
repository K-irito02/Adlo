import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface SiteMetaCacheEntry {
  title: string;
  faviconUrl: string;
  faviconDataUri: string;
  fetchedAt: number;
}

const CACHE_DIR = '.adl-cache';
const CACHE_FILE = 'site-meta-cache.json';

function cachePath(baseDir: string): string {
  return path.join(baseDir, CACHE_DIR, CACHE_FILE);
}

export async function readSiteMetaCache(baseDir: string): Promise<Record<string, SiteMetaCacheEntry>> {
  try {
    const raw = await fs.readFile(cachePath(baseDir), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, SiteMetaCacheEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function writeSiteMetaCache(
  baseDir: string,
  entries: Record<string, SiteMetaCacheEntry>,
): Promise<void> {
  await fs.mkdir(path.dirname(cachePath(baseDir)), { recursive: true });
  await fs.writeFile(cachePath(baseDir), JSON.stringify(entries), 'utf8');
}
