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
});
