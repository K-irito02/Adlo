import { describe, it, expect, vi } from 'vitest';
import { pageMetaGateAllows } from './previewCrawlerGate';

describe('previewCrawlerGate', () => {
  it('private url always allowed (no fetch)', async () => {
    const fetchImpl = vi.fn();
    expect(await pageMetaGateAllows('http://localhost:3000', fetchImpl)).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('disallow hard blocks; fail-open on error', async () => {
    const disallow = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => 'User-agent: *\nDisallow: /private',
    }) as unknown as Response);
    expect(await pageMetaGateAllows('https://example.com/private/a', disallow, 1000)).toBe(false);

    const fail = vi.fn(async () => ({ ok: false, status: 500 } as Response));
    expect(await pageMetaGateAllows('https://example.com/x', fail, 1000)).toBe(true);
  });

  // 模块级单例限速器跨测试持久，此处每例使用独立域名避免状态泄漏。
  it('rate limits same public domain within 5s window', async () => {
    const fail = vi.fn(async () => ({ ok: false, status: 500 } as Response));
    const url = 'https://rl-same.test/page';
    expect(await pageMetaGateAllows(url, fail, 1000)).toBe(true);
    expect(await pageMetaGateAllows(url, fail, 2000)).toBe(false);
  });

  it('rate limit releases after window elapses', async () => {
    const fail = vi.fn(async () => ({ ok: false, status: 500 } as Response));
    const url = 'https://rl-release.test/page';
    expect(await pageMetaGateAllows(url, fail, 1000)).toBe(true);
    expect(await pageMetaGateAllows(url, fail, 6000)).toBe(true);
  });

  it('different domains are rate limited independently', async () => {
    const fail = vi.fn(async () => ({ ok: false, status: 500 } as Response));
    expect(await pageMetaGateAllows('https://rl-a.test/', fail, 1000)).toBe(true);
    expect(await pageMetaGateAllows('https://rl-b.test/', fail, 1000)).toBe(true);
  });

  it('same-origin favicon after HTML gate is not rate limited (rateLimit:false)', async () => {
    const fail = vi.fn(async () => ({ ok: false, status: 500 } as Response));
    const url = 'https://rl-fav.test/page';
    const favicon = 'https://rl-fav.test/favicon.ico';
    // HTML 门控：为域名扣减令牌
    expect(await pageMetaGateAllows(url, fail, 1000)).toBe(true);
    // 默认限速路径：同窗口内第二次请求被拒（证明存在限速）
    expect(await pageMetaGateAllows(favicon, fail, 2000)).toBe(false);
    // favicon 门控走 robots-only 路径（rateLimit:false）：同窗口内不被限速
    expect(await pageMetaGateAllows(favicon, fail, 2000, { rateLimit: false })).toBe(true);
  });

  it('private url is never rate limited', async () => {
    const fetchImpl = vi.fn();
    expect(await pageMetaGateAllows('http://localhost:3000', fetchImpl, 1000)).toBe(true);
    expect(await pageMetaGateAllows('http://localhost:3000', fetchImpl, 1000)).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
