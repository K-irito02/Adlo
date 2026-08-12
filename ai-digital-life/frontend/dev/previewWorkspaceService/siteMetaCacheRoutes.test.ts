import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { putSiteMetaCacheRoute, deleteSiteMetaCacheRoute } from './index';
import { writeSiteMetaCache, readSiteMetaCache } from './siteMetaCache';

async function makeCacheDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'adl-site-meta-routes-'));
}

const cacheFilePath = (dir: string) => path.join(dir, '.adl-cache', 'site-meta-cache.json');

describe('preview site-meta-cache route validation (N2)', () => {
  it('PUT rejects a non-plain-object entries payload (string)', async () => {
    const result = await putSiteMetaCacheRoute({ entries: 'nope' });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_INPUT');
  });

  it('PUT rejects a non-plain-object entries payload (array)', async () => {
    const result = await putSiteMetaCacheRoute({ entries: ['https://a.com'] });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_INPUT');
  });

  it('PUT rejects a missing entries payload', async () => {
    const result = await putSiteMetaCacheRoute({});
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_INPUT');
  });

  it('PUT accepts a plain-object entries payload and persists it', async () => {
    const dir = await makeCacheDir();
    const result = await putSiteMetaCacheRoute({
      baseDir: dir,
      entries: {
        'https://a.com/': {
          title: 'A',
          faviconUrl: '',
          faviconDataUri: 'data:image/png;base64,AA',
          fetchedAt: 1,
        },
      },
    });
    expect(result.ok).toBe(true);
    const all = await readSiteMetaCache(dir);
    expect(all['https://a.com/'].title).toBe('A');
  });

  it('DELETE rejects a non-array urls payload', async () => {
    const result = await deleteSiteMetaCacheRoute({ urls: 'https://a.com' });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_INPUT');
  });
});

describe('preview site-meta-cache DELETE no-op handling (L3)', () => {
  it('DELETE with no urls and no clearAll does NOT rewrite the cache file', async () => {
    const dir = await makeCacheDir();
    await writeSiteMetaCache(dir, {
      'https://a.com/': { title: 'A', faviconUrl: '', faviconDataUri: '', fetchedAt: 1 },
    });
    const filePath = cacheFilePath(dir);
    const beforeMtime = (await fs.stat(filePath)).mtimeMs;

    const result = await deleteSiteMetaCacheRoute({ baseDir: dir });
    expect(result.ok).toBe(true);

    const afterMtime = (await fs.stat(filePath)).mtimeMs;
    expect(afterMtime).toBe(beforeMtime);
  });

  it('DELETE with urls that do not exist in the cache does NOT rewrite the file', async () => {
    const dir = await makeCacheDir();
    await writeSiteMetaCache(dir, {
      'https://a.com/': { title: 'A', faviconUrl: '', faviconDataUri: '', fetchedAt: 1 },
    });
    const filePath = cacheFilePath(dir);
    const beforeMtime = (await fs.stat(filePath)).mtimeMs;

    const result = await deleteSiteMetaCacheRoute({ baseDir: dir, urls: ['https://missing.com'] });
    expect(result.ok).toBe(true);

    const afterMtime = (await fs.stat(filePath)).mtimeMs;
    expect(afterMtime).toBe(beforeMtime);
  });

  it('DELETE with matching urls removes the keys and writes the file', async () => {
    const dir = await makeCacheDir();
    await writeSiteMetaCache(dir, {
      'https://a.com/': { title: 'A', faviconUrl: '', faviconDataUri: '', fetchedAt: 1 },
      'https://b.com/': { title: 'B', faviconUrl: '', faviconDataUri: '', fetchedAt: 1 },
    });
    const result = await deleteSiteMetaCacheRoute({ baseDir: dir, urls: ['https://a.com/'] });
    expect(result.ok).toBe(true);
    const all = await readSiteMetaCache(dir);
    expect(all['https://a.com/']).toBeUndefined();
    expect(all['https://b.com/'].title).toBe('B');
  });

  it('DELETE with clearAll empties the cache even with no urls', async () => {
    const dir = await makeCacheDir();
    await writeSiteMetaCache(dir, {
      'https://a.com/': { title: 'A', faviconUrl: '', faviconDataUri: '', fetchedAt: 1 },
    });
    const result = await deleteSiteMetaCacheRoute({ baseDir: dir, clearAll: true });
    expect(result.ok).toBe(true);
    const all = await readSiteMetaCache(dir);
    expect(Object.keys(all)).toHaveLength(0);
  });
});
