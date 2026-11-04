import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * 预览模式 JSON 持久层条目。8 字段与 Rust `SiteMetaCacheEntry`
 * （crates/browser/src/site_meta_cache.rs）及前端只读镜像
 * （src/app/utils/siteMetaBackends/types.ts）逐字段同构。
 */
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

const CACHE_DIR = '.adl-cache';
const CACHE_FILE = 'site-meta-cache.json';

function cachePath(baseDir: string): string {
  return path.join(baseDir, CACHE_DIR, CACHE_FILE);
}

/**
 * 读取 JSON 持久层。反序列化缺省兼容：旧缓存文件缺失 4 个新增字段
 * （titleSource/lastOkAt/nextRetryAt/failCount）时用默认值补齐
 * （'' / 0 / 0 / 0），与 Rust `read` 的 SQLite NOT NULL DEFAULT 语义一致。
 */
export async function readSiteMetaCache(
  baseDir: string,
): Promise<Record<string, SiteMetaCacheEntry>> {
  try {
    const raw = await fs.readFile(cachePath(baseDir), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, Partial<SiteMetaCacheEntry>>;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    const out: Record<string, SiteMetaCacheEntry> = {};
    for (const [key, e] of Object.entries(parsed)) {
      if (!e || typeof e !== 'object') continue;
      out[key] = {
        title: e.title ?? '',
        titleSource: e.titleSource ?? '',
        faviconUrl: e.faviconUrl ?? '',
        faviconDataUri: e.faviconDataUri ?? '',
        fetchedAt: e.fetchedAt ?? 0,
        lastOkAt: e.lastOkAt ?? 0,
        nextRetryAt: e.nextRetryAt ?? 0,
        failCount: e.failCount ?? 0,
      };
    }
    return out;
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

export async function upsertSiteMetaCache(
  baseDir: string,
  entries: Record<string, SiteMetaCacheEntry>,
): Promise<void> {
  const current = await readSiteMetaCache(baseDir);
  await writeSiteMetaCache(baseDir, { ...current, ...entries });
}
