import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { readSiteMetaCache, writeSiteMetaCache } from './siteMetaCache';

describe('siteMetaCache preview store', () => {
  it('roundtrips entries through JSON file', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'adl-site-meta-'));
    await writeSiteMetaCache(dir, {
      'https://a.com/': { title: 'A', faviconUrl: 'https://a.com/favicon.ico', faviconDataUri: 'data:image/png;base64,AA', fetchedAt: 1700000000000 },
    });
    const all = await readSiteMetaCache(dir);
    expect(all['https://a.com/'].title).toBe('A');
  });
});
