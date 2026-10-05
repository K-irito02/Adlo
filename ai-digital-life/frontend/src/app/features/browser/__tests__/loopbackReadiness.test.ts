import { describe, it, expect, vi, afterEach } from 'vitest';
import { isLoopbackHttpUrl, waitForLoopbackReachable } from '../loopbackReadiness';

describe('isLoopbackHttpUrl', () => {
  it.each([
    ['http://127.0.0.1:3080', true],
    ['http://localhost:3080/', true],
    ['https://[::1]:8443', true],
    ['https://example.com', false],
    ['http://192.168.1.10:3000', false],
    ['file:///tmp/x', false],
    ['not a url', false],
  ])('%s -> %s', (url, expected) => {
    expect(isLoopbackHttpUrl(url)).toBe(expected);
  });
});

describe('waitForLoopbackReachable', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('在探测成功后返回 true（首次被拒、第二次成功）', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({});
    vi.stubGlobal('fetch', fetchMock);

    await expect(waitForLoopbackReachable('http://127.0.0.1:3080')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('首次探测即成功则只探测一次', async () => {
    const fetchMock = vi.fn().mockResolvedValue({});
    vi.stubGlobal('fetch', fetchMock);

    await expect(waitForLoopbackReachable('http://localhost:3080')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
