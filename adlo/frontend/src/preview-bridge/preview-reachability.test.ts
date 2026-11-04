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

  it('caches failed probes briefly so offline calls do not stall per call', async () => {
    // Closing H-1：失败负缓存 5s，TTL 内不重探（离线时每个业务调用不再付 2s 超时）。
    const fetchMock = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(isAdServerReachable('http://127.0.0.1:3333')).resolves.toBe(false);
    await expect(isAdServerReachable('http://127.0.0.1:3333')).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-probes after the negative-cache TTL so a slow server is picked up', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce(okHealth());
      vi.stubGlobal('fetch', fetchMock);

      await expect(isAdServerReachable('http://127.0.0.1:3355')).resolves.toBe(false);
      // TTL 过期后重探成功。
      await vi.advanceTimersByTimeAsync(6000);
      await expect(isAdServerReachable('http://127.0.0.1:3355')).resolves.toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('notifies listeners on reachability transitions (once per value)', async () => {
    const seen: [string, boolean][] = [];
    const unsub = onAdServerReachabilityChange((baseUrl, reachable) => {
      seen.push([baseUrl, reachable]);
    });
    vi.useFakeTimers();
    try {
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue(okHealth());
      vi.stubGlobal('fetch', fetchMock);

      await isAdServerReachable('http://127.0.0.1:4444');
      await vi.advanceTimersByTimeAsync(6000);
      await isAdServerReachable('http://127.0.0.1:4444');
      expect(seen).toEqual([
        ['http://127.0.0.1:4444', false],
        ['http://127.0.0.1:4444', true],
      ]);
    } finally {
      vi.useRealTimers();
      unsub();
    }
  });

  it('treats non-ok HTTP (e.g. 502) as unreachable with negative caching', async () => {
    // Closing L-10：网关 502 这类非异常失败同样删键…现为负缓存 + notify(false)。
    const fetchMock = vi.fn(async () => ({ ok: false, status: 502 }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(isAdServerReachable('http://127.0.0.1:5555')).resolves.toBe(false);
    await expect(isAdServerReachable('http://127.0.0.1:5555')).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
