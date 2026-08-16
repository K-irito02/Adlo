import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createPreviewPageMetaService } from './pageMetaService';
import { readSiteMetaCache } from './siteMetaCache';
import type { PageMeta } from '../../src/shared/ipc/browser';

describe('preview pageMetaService (isomorphic to Rust PageMetaService)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'adl-pms-'));
  });

  const emptyMeta = (url: string): PageMeta => ({ title: '', favicon: '', faviconDataUri: '', url });

  it('get success caches with http source; ttl short-circuit skips refetch', async () => {
    let calls = 0;
    const svc = createPreviewPageMetaService({
      baseDir: dir,
      fetchOnce: async (url) => {
        calls += 1;
        return { title: 'X', favicon: 'https://a.com/favicon.ico', faviconDataUri: '', url };
      },
    });

    const meta = await svc.get('https://a.com/');
    expect(meta?.title).toBe('X');
    expect(calls).toBe(1);

    const cached = svc.peek('https://a.com/');
    expect(cached?.title).toBe('X');
    expect(cached?.titleSource).toBe('http');
    expect(cached?.lastOkAt).toBeGreaterThan(0);
    expect(cached?.failCount).toBe(0);

    // TTL 内第二次 get：命中缓存，不抓取
    const meta2 = await svc.get('https://a.com/');
    expect(meta2?.title).toBe('X');
    expect(calls).toBe(1);

    // force 绕过 TTL：强制重抓
    await svc.get('https://a.com/', true);
    expect(calls).toBe(2);
  });

  it('get failure keeps cache and backs off', async () => {
    let result: PageMeta = { title: 'A', favicon: '', faviconDataUri: '', url: '' };
    const svc = createPreviewPageMetaService({
      baseDir: dir,
      fetchOnce: async (url) => result,
    });

    await svc.get('https://a.com/'); // 成功写入缓存 A
    result = emptyMeta(''); // 后续抓取返回空 → 失败
    const meta = await svc.get('https://a.com/', true); // force 绕过 TTL 短路

    expect(meta?.title).toBe('');
    const cached = svc.peek('https://a.com/');
    expect(cached?.title).toBe('A');
    expect(cached?.failCount).toBe(1);
    expect(cached?.nextRetryAt).toBeGreaterThan(0);
  });

  it('report com does not clobber http title', async () => {
    const svc = createPreviewPageMetaService({
      baseDir: dir,
      fetchOnce: async (url) => emptyMeta(url),
    });

    await svc.report('https://a.com/', '真实标题', '', 'http');
    await svc.report('https://a.com/', '陈旧标题', '', 'com');

    expect(svc.peek('https://a.com/')?.title).toBe('真实标题');
  });

  it('placeholder title from get does not clobber authoritative', async () => {
    let result: PageMeta = { title: '真实标题', favicon: '', faviconDataUri: '', url: '' };
    const svc = createPreviewPageMetaService({
      baseDir: dir,
      fetchOnce: async (url) => result,
    });

    await svc.get('https://a.com/', true);
    result = { title: 'a.com', favicon: '', faviconDataUri: '', url: '' }; // hostname 占位标题
    await svc.get('https://a.com/', true);

    expect(svc.peek('https://a.com/')?.title).toBe('真实标题');
  });

  it('single flight deduplicates concurrent gets for the same url', async () => {
    let calls = 0;
    let resolveFetch: (m: PageMeta) => void = () => {};
    const svc = createPreviewPageMetaService({
      baseDir: dir,
      fetchOnce: () => {
        calls += 1;
        return new Promise<PageMeta>((resolve) => {
          resolveFetch = resolve;
        });
      },
    });

    const p1 = svc.get('https://a.com/');
    const p2 = svc.get('https://a.com/');
    await new Promise((r) => setTimeout(r, 20)); // 让 preload 与两个并发 get 的续体推进
    expect(calls).toBe(1);

    resolveFetch({ title: 'X', favicon: '', faviconDataUri: '', url: 'https://a.com/' });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1?.title).toBe('X');
    expect(r2?.title).toBe('X');
  });

  it('get success persists the merged entry to the json cache (debounced)', async () => {
    const svc = createPreviewPageMetaService({
      baseDir: dir,
      fetchOnce: async (url) => ({
        title: 'A',
        favicon: 'https://a.com/favicon.ico',
        faviconDataUri: '',
        url,
      }),
    });

    await svc.get('https://a.com/');
    await new Promise((r) => setTimeout(r, 700)); // 等防抖 500ms 持久化落盘

    const all = await readSiteMetaCache(dir);
    const e = all['https://a.com/'];
    expect(e).toBeDefined();
    expect(e?.title).toBe('A');
    expect(e?.titleSource).toBe('http');
    expect(e?.faviconUrl).toBe('https://a.com/favicon.ico');
    expect(e?.lastOkAt).toBeGreaterThan(0);
  });

  it('report with rejected title/favicon returns false and leaves cache unchanged', async () => {
    const svc = createPreviewPageMetaService({
      baseDir: dir,
      fetchOnce: async (url) => emptyMeta(url),
    });

    await svc.report('https://a.com/', '真实标题', 'https://a.com/icon-256.png', 'http');
    const changed = await svc.report('https://a.com/', '陈旧标题', 'https://a.com/favicon.ico', 'com');

    expect(changed).toBe(false);
    const e = svc.peek('https://a.com/');
    expect(e?.title).toBe('真实标题');
    expect(e?.faviconUrl).toBe('https://a.com/icon-256.png');
  });

  it('peek normalizes hash and trailing-slash url variants', async () => {
    const svc = createPreviewPageMetaService({
      baseDir: dir,
      fetchOnce: async (url) => ({ title: 'A', favicon: '', faviconDataUri: '', url }),
    });

    await svc.get('https://a.com/');
    expect(svc.peek('https://a.com/#sec')?.title).toBe('A');
    expect(svc.peek('https://a.com')?.title).toBe('A');
  });

  it('subscribeUpdated broadcasts get success and report change; unsubscribe stops', async () => {
    const svc = createPreviewPageMetaService({
      baseDir: dir,
      fetchOnce: async (url) => ({ title: 'A', favicon: '', faviconDataUri: '', url }),
    });

    const events: Array<{ title: string; source: string }> = [];
    const unsub = svc.subscribeUpdated((p) => events.push({ title: p.title, source: p.source }));

    await svc.get('https://a.com/');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ title: 'A', source: 'http' });

    await svc.report('https://b.com/', 'B', '', 'com');
    expect(events).toHaveLength(2);
    expect(events[1]).toEqual({ title: 'B', source: 'com' });

    unsub();
    await svc.report('https://c.com/', 'C', '', 'http');
    expect(events).toHaveLength(2);
  });

  it('warmup dedupes urls and respects retry backoff', async () => {
    let calls = 0;
    const svc = createPreviewPageMetaService({
      baseDir: dir,
      fetchOnce: async (url) => {
        calls += 1;
        return emptyMeta(url);
      },
    });

    // 同 URL（hash 变体）去重；无缓存 → 抓取 1 次
    await svc.warmup(['https://a.com/', 'https://a.com/#x']);
    expect(calls).toBe(1);

    // 抓取失败后 nextRetryAt 未到 → 不重试
    await svc.warmup(['https://a.com/']);
    expect(calls).toBe(1);
  });
});
