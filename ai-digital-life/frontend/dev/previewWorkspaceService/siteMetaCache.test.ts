import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { readSiteMetaCache, writeSiteMetaCache, upsertSiteMetaCache } from './siteMetaCache';

describe('siteMetaCache preview store', () => {
  it('roundtrips entries through JSON file', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'adl-site-meta-'));
    await writeSiteMetaCache(dir, {
      'https://a.com/': { title: 'A', titleSource: '', faviconUrl: 'https://a.com/favicon.ico', faviconDataUri: 'data:image/png;base64,AA', fetchedAt: 1700000000000, lastOkAt: 0, nextRetryAt: 0, failCount: 0 },
    });
    const all = await readSiteMetaCache(dir);
    expect(all['https://a.com/'].title).toBe('A');
  });

  it('upsertSiteMetaCache merges a delta without erasing previously cached entries', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'adl-site-meta-merge-'));
    await writeSiteMetaCache(dir, {
      'https://a.com/': { title: 'A', titleSource: '', faviconUrl: '', faviconDataUri: 'data:image/png;base64,AA', fetchedAt: 1, lastOkAt: 0, nextRetryAt: 0, failCount: 0 },
    });
    await upsertSiteMetaCache(dir, {
      'https://b.com/': { title: 'B', titleSource: '', faviconUrl: '', faviconDataUri: '', fetchedAt: 2, lastOkAt: 0, nextRetryAt: 0, failCount: 0 },
    });
    const all = await readSiteMetaCache(dir);
    expect(all['https://a.com/'].title).toBe('A');
    expect(all['https://b.com/'].title).toBe('B');
  });

  it('upsertSiteMetaCache replaces an existing key with the new value', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'adl-site-meta-replace-'));
    await writeSiteMetaCache(dir, {
      'https://a.com/': { title: 'Old', titleSource: '', faviconUrl: '', faviconDataUri: '', fetchedAt: 1, lastOkAt: 0, nextRetryAt: 0, failCount: 0 },
    });
    await upsertSiteMetaCache(dir, {
      'https://a.com/': { title: 'New', titleSource: '', faviconUrl: '', faviconDataUri: '', fetchedAt: 2, lastOkAt: 0, nextRetryAt: 0, failCount: 0 },
    });
    const all = await readSiteMetaCache(dir);
    expect(all['https://a.com/'].title).toBe('New');
  });

  it('upsertSiteMetaCache on an empty store writes only the delta', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'adl-site-meta-empty-'));
    await upsertSiteMetaCache(dir, {
      'https://a.com/': { title: 'A', titleSource: '', faviconUrl: '', faviconDataUri: '', fetchedAt: 1, lastOkAt: 0, nextRetryAt: 0, failCount: 0 },
    });
    const all = await readSiteMetaCache(dir);
    expect(all['https://a.com/'].title).toBe('A');
  });
});
