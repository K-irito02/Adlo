import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isAdServerReachable,
  onAdServerReachabilityChange,
  resetAdServerReachability,
} from './preview-reachability';

function okHealth(): Response {
  return { ok: true, status: 200 } as Response;
}

describe('preview-reachability', () => {
  beforeEach(() => {
    resetAdServerReachability();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetAdServerReachability();
  });

  it('caches successful probes per baseUrl (no stampede, no cross-talk)', async () => {
    const fetchMock = vi.fn(async () => okHealth());
    vi.stubGlobal('fetch', fetchMock);

    await expect(isAdServerReachable('http://127.0.0.1:1111')).resolves.toBe(true);
    await expect(isAdServerReachable('http://127.0.0.1:1111')).resolves.toBe(true);
    await expect(isAdServerReachable('http://127.0.0.1:2222')).resolves.toBe(true);

    // 同 baseUrl 命中缓存，不同 baseUrl 各探一次。
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache failed probes so a slow-starting server is picked up', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(okHealth());
    vi.stubGlobal('fetch', fetchMock);

    await expect(isAdServerReachable('http://127.0.0.1:3333')).resolves.toBe(false);
    await expect(isAdServerReachable('http://127.0.0.1:3333')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('notifies listeners on reachability transitions (once per value)', async () => {
    const seen: [string, boolean][] = [];
    const unsub = onAdServerReachabilityChange((baseUrl, reachable) => {
      seen.push([baseUrl, reachable]);
    });
    try {
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue(okHealth());
      vi.stubGlobal('fetch', fetchMock);

      await isAdServerReachable('http://127.0.0.1:4444');
      await isAdServerReachable('http://127.0.0.1:4444');
      expect(seen).toEqual([
        ['http://127.0.0.1:4444', false],
        ['http://127.0.0.1:4444', true],
      ]);
    } finally {
      unsub();
    }
  });
});
