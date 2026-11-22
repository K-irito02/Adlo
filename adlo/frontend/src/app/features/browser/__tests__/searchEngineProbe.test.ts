import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  orderEnginesForAutoSelect,
  pickReachableSearchEngine,
  probeSearchEngine,
} from '../searchEngineProbe';
import type { SearchEngine } from '@stores/slices/browserSearchEnginesSlice';

function engine(id: string, name: string, urlTemplate: string): SearchEngine {
  return { id, name, urlTemplate, isBuiltIn: true, isDefault: false };
}

const engines = [
  engine('baidu', '百度', 'https://www.baidu.com/s?wd=%s'),
  engine('google', 'Google', 'https://www.google.com/search?q=%s'),
  engine('bing', 'Bing', 'https://www.bing.com/search?q=%s'),
];

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('orderEnginesForAutoSelect', () => {
  it('orders known hosts by proxy-on-first preference', () => {
    expect(orderEnginesForAutoSelect(engines).map((item) => item.id)).toEqual([
      'google',
      'bing',
      'baidu',
    ]);
  });
});

describe('probeSearchEngine', () => {
  it('treats a resolved no-cors request as reachable', async () => {
    fetchMock.mockResolvedValue({});
    await expect(probeSearchEngine(engines[0])).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.baidu.com/favicon.ico',
      expect.objectContaining({ mode: 'no-cors' }),
    );
  });

  it('treats a rejected request as unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('blocked'));
    await expect(probeSearchEngine(engines[1])).resolves.toBe(false);
  });

  it('aborts and reports unreachable after the timeout', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    const promise = probeSearchEngine(engines[1], 1000);
    await vi.advanceTimersByTimeAsync(999);
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toBe(false);
  });
});

describe('pickReachableSearchEngine', () => {
  it('returns the first reachable engine in priority order', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes('baidu') ? Promise.resolve({}) : Promise.reject(new Error('blocked')),
    );

    const picked = await pickReachableSearchEngine(engines);
    expect(picked?.id).toBe('baidu');
  });

  it('returns null when every engine is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('blocked'));
    await expect(pickReachableSearchEngine(engines)).resolves.toBeNull();
  });
});
