import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createPreviewPageMetaService, normalizeCacheKey } from './pageMetaService';
import { readSiteMetaCache, upsertSiteMetaCache } from './siteMetaCache';
import type { PageMeta } from '../../src/shared/ipc/browser';

describe('preview pageMetaService (isomorphic to Rust PageMetaService)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'adl-pms-'));
  });

  const emptyMeta = (url: string): PageMeta => ({
    title: '',
    favicon: '',
    faviconDataUri: '',
    url,
  });

  /** HTML 级门控 stub：测试默认放行，避免真实 robots.txt 网络请求与单例限速器干扰。 */
  const allowGate = (): Promise<boolean> => Promise.resolve(true);

  it('get success caches with http source; ttl short-circuit skips refetch', async () => {
    let calls = 0;
    const svc = createPreviewPageMetaService({
      baseDir: dir,
      gateAllows: allowGate,
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

  it('get ttl-hit returns the real cached title source (com)', async () => {
    // BLOCKING 修复回归（与 Rust get_ttl_hit_returns_real_cached_title_source 同构）：
    // TTL 命中的 get 必须返回缓存条目的真实 titleSource（com），而非硬编码 http。
    let calls = 0;
    const svc = createPreviewPageMetaService({
      baseDir: dir,
      gateAllows: allowGate,
      fetchOnce: async (url) => {
        calls += 1;
        return { title: 'X', favicon: '', faviconDataUri: '', url };
      },
    });

    // com report 设置 titleSource=com 且 lastOkAt=now（TTL 窗口内）
    await svc.report('https://a.com/', '真实标题', '', 'com');
    // TTL 命中：不触发抓取，返回缓存条目的真实来源 com 与真实 url（缓存键）
    const meta = await svc.get('https://a.com/');
    expect(calls).toBe(0);
    expect(meta?.source).toBe('com');
    expect(meta?.url).toBe('https://a.com/');
  });

  it('get backoff short-circuit returns the real cache key url (R1 isomorphic)', async () => {
    // 与 Rust get 退避短路路径（携带 url: key）同构：失败域名在退避期内 get
    // 必须返回缓存条目且 url 为缓存键，而非空 —— 否则调用方按 meta.url 写镜像
    // 会落到空 key（R1 回归类别）。
    let result: PageMeta = { title: 'A', favicon: '', faviconDataUri: '', url: '' };
    const svc = createPreviewPageMetaService({
      baseDir: dir,
      gateAllows: allowGate,
      fetchOnce: async () => result,
    });

    await svc.get('https://a.com/'); // 成功 → lastOkAt 已置
    result = emptyMeta(''); // 后续抓取返回空 → 失败 → 进入退避
    await svc.get('https://a.com/', true);
    expect(svc.peek('https://a.com/')?.failCount).toBe(1);

    // 退避短路：lastOkAt===0 且 now < nextRetryAt → 不抓取，返回缓存条目 + 真实 url
    const meta = await svc.get('https://a.com/');
    expect(meta?.title).toBe('A');
    expect(meta?.url).toBe('https://a.com/');
  });

  it('get failure keeps cache and backs off', async () => {
    let result: PageMeta = { title: 'A', favicon: '', faviconDataUri: '', url: '' };
    const svc = createPreviewPageMetaService({
      baseDir: dir,
      gateAllows: allowGate,
      fetchOnce: async (url) => result,
    });

    await svc.get('https://a.com/'); // 成功写入缓存 A
    result = emptyMeta(''); // 后续抓取返回空 → 失败
    const meta = await svc.get('https://a.com/', true); // force 绕过 TTL 短路

    // RC3：抓取失败时 get 返回缓存条目的合并值（A），而非空结果 ——
    // 否则空 meta 经预览路由/广播清空前端镜像（真实图标来回切换）。
    expect(meta?.title).toBe('A');
    const cached = svc.peek('https://a.com/');
    expect(cached?.title).toBe('A');
    expect(cached?.failCount).toBe(1);
    expect(cached?.nextRetryAt).toBeGreaterThan(0);
  });

  it('get returns empty when robots gate blocks the url', async () => {
    const fetchSpy = vi.fn(async (url: string) => ({
      title: 'X',
      favicon: 'https://blocked.example/favicon.ico',
      faviconDataUri: '',
      url,
    }));
    const svc = createPreviewPageMetaService({
      baseDir: dir,
      fetchOnce: fetchSpy,
      gateAllows: () => Promise.resolve(false), // robots 门控拒绝该 URL
    });

    const meta = await svc.get('https://blocked.example/');

    // 被 gate 拦截：返回空 PageMeta，且不触发真实抓取
    expect(meta?.title).toBe('');
    expect(meta?.favicon).toBe('');
    expect(fetchSpy).not.toHaveBeenCalled();

    // 空 PageMeta → 失败退避语义（预览保留的旧策略：失败不删缓存、记 failCount + nextRetryAt）
    const entry = svc.peek('https://blocked.example/');
    expect(entry?.failCount).toBe(1);
    expect(entry?.nextRetryAt).toBeGreaterThan(0);
  });

  it('report com does not clobber http title', async () => {
    const svc = createPreviewPageMetaService({
      baseDir: dir,
      gateAllows: allowGate,
      fetchOnce: async (url) => emptyMeta(url),
    });

    await svc.report('https://a.com/', '真实标题', '', 'http');
    await svc.report('https://a.com/', '陈旧标题', '', 'com');

    expect(svc.peek('https://a.com/')?.title).toBe('真实标题');
  });

  it('report com fills placeholder title', async () => {
    // 占位标题无法经 report/get 写入（占位门控拒绝 incoming 占位），故经 JSON 持久层
    // 预载构造内存条目，模拟"当前为占位标题"（与 Rust 测试直接构造内存条目等价）。
    await upsertSiteMetaCache(dir, {
      'https://a.com/': {
        title: 'a.com',
        titleSource: 'http',
        faviconUrl: '',
        faviconDataUri: '',
        fetchedAt: 0,
        lastOkAt: 0,
        nextRetryAt: 0,
        failCount: 0,
      },
    });
    const svc = createPreviewPageMetaService({
      baseDir: dir,
      gateAllows: allowGate,
      fetchOnce: async (url) => emptyMeta(url),
    });

    // report 内部 await preloadPromise，内存已含占位条目；com 上报真实标题 → 占位被覆盖
    const changed = await svc.report('https://a.com/', '真实标题', '', 'com');

    expect(changed).toBe(true);
    const e = svc.peek('https://a.com/');
    expect(e?.title).toBe('真实标题');
    expect(e?.titleSource).toBe('com');
  });

  it('placeholder title from get does not clobber authoritative', async () => {
    let result: PageMeta = { title: '真实标题', favicon: '', faviconDataUri: '', url: '' };
    const svc = createPreviewPageMetaService({
      baseDir: dir,
      gateAllows: allowGate,
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
      gateAllows: allowGate,
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
      gateAllows: allowGate,
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
      gateAllows: allowGate,
      fetchOnce: async (url) => emptyMeta(url),
    });

    await svc.report('https://a.com/', '真实标题', 'https://a.com/icon-256.png', 'http');
    const changed = await svc.report(
      'https://a.com/',
      '陈旧标题',
      'https://a.com/favicon.ico',
      'com',
    );

    expect(changed).toBe(false);
    const e = svc.peek('https://a.com/');
    expect(e?.title).toBe('真实标题');
    expect(e?.faviconUrl).toBe('https://a.com/icon-256.png');
  });

  it('peek normalizes hash and trailing-slash url variants', async () => {
    const svc = createPreviewPageMetaService({
      baseDir: dir,
      gateAllows: allowGate,
      fetchOnce: async (url) => ({ title: 'A', favicon: '', faviconDataUri: '', url }),
    });

    await svc.get('https://a.com/');
    expect(svc.peek('https://a.com/#sec')?.title).toBe('A');
    expect(svc.peek('https://a.com')?.title).toBe('A');
  });

  it('subscribeUpdated broadcasts get success and report change; unsubscribe stops', async () => {
    const svc = createPreviewPageMetaService({
      baseDir: dir,
      gateAllows: allowGate,
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
      gateAllows: allowGate,
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

  it('warmup processes ALL retry-due urls (not truncated at concurrency) and returns their metas (⑦)', async () => {
    const fetched: string[] = [];
    const svc = createPreviewPageMetaService({
      baseDir: dir,
      gateAllows: allowGate,
      fetchOnce: async (url) => {
        fetched.push(url);
        return { title: `T-${url}`, favicon: '', faviconDataUri: '', url };
      },
    });
    const urls = Array.from({ length: 12 }, (_, i) => `https://warmup${i}.example/`);
    const metas = await svc.warmup(urls);
    // 旧实现 tasks.length >= WARMUP_CONCURRENCY(8) 截断 → 仅 8 个被抓取
    expect(fetched.length).toBe(12);
    // 预热结果返回全部 metas（供 preview 路由回传 → 前端镜像落地）
    expect(metas.length).toBe(12);
    expect(metas[0]?.title).toBe('T-https://warmup0.example/');
    expect(metas[0]?.url).toBe('https://warmup0.example/');
  });
});

describe('normalizeCacheKey strips one-time auth token (R1-Medium)', () => {
  it('drops token param but keeps other params (isomorphic to Rust normalize_cache_key)', () => {
    expect(normalizeCacheKey('http://127.0.0.1:3080/?token=abc')).toBe(
      'http://127.0.0.1:3080/',
    );
    expect(normalizeCacheKey('https://a.com/p?x=1&token=abc&y=2')).toBe(
      'https://a.com/p?x=1&y=2',
    );
    expect(normalizeCacheKey('https://a.com/p?x=1')).toBe('https://a.com/p?x=1');
  });
});
