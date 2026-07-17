import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBrowserPool } from './useBrowserPool';

vi.mock('../../../shared/env', () => ({
  isTauriShell: () => true,
}));

const DEFAULT_BROWSER_MOCK = {
  createForTab: vi.fn().mockResolvedValue(null),
  activateTab: vi.fn().mockResolvedValue(undefined),
  destroyTab: vi.fn().mockResolvedValue(undefined),
};

function setMockBrowser(overrides: Partial<typeof DEFAULT_BROWSER_MOCK> = {}) {
  (window as unknown as Record<string, unknown>).digitalLife = {
    browser: { ...DEFAULT_BROWSER_MOCK, ...overrides },
  };
}

describe('useBrowserPool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as unknown as Record<string, unknown>).digitalLife;
  });

  it('starts with empty pool', () => {
    setMockBrowser();
    const { result } = renderHook(() => useBrowserPool());
    expect(result.current.poolSize).toBe(0);
    expect(result.current.isTabInPool('tab-1')).toBe(false);
  });

  it('registers tab in pool via createWebViewForTab', async () => {
    setMockBrowser();

    const { result } = renderHook(() => useBrowserPool());
    await act(async () => {
      await result.current.createWebViewForTab('tab-1', 'https://example.com');
    });
    expect(result.current.poolSize).toBe(1);
    expect(result.current.isTabInPool('tab-1')).toBe(true);
  });

  it('evicts LRU tab when pool is full', async () => {
    const createForTab = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('a');
    setMockBrowser({ createForTab });

    const { result } = renderHook(() => useBrowserPool());
    await act(async () => {
      await result.current.createWebViewForTab('a', 'https://a.com');
    });
    await act(async () => {
      await result.current.createWebViewForTab('b', 'https://b.com');
    });
    await act(async () => {
      await result.current.createWebViewForTab('c', 'https://c.com');
    });

    expect(result.current.isTabInPool('a')).toBe(false);
    expect(result.current.isTabInPool('b')).toBe(true);
    expect(result.current.isTabInPool('c')).toBe(true);
  });

  it('removeFromPool frees a slot', async () => {
    setMockBrowser();

    const { result } = renderHook(() => useBrowserPool());
    await act(async () => {
      await result.current.createWebViewForTab('a', 'https://a.com');
    });
    await act(async () => {
      await result.current.createWebViewForTab('b', 'https://b.com');
    });
    expect(result.current.poolSize).toBe(2);

    await act(async () => {
      await result.current.removeFromPool('a');
    });

    expect(result.current.poolSize).toBe(1);
    expect(result.current.isTabInPool('a')).toBe(false);
  });
});
