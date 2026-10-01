import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBrowserPool } from './useBrowserPool';
import { browserPool } from './browserPoolSingleton';
import { useAppStore } from '../../stores/slicedStore';

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
    browserPool.reset();
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

  it('bumps siblingWebviewNonce on native child creation（桥接条 z-order 重建信号）', async () => {
    setMockBrowser();
    const before = useAppStore.getState().siblingWebviewNonce;

    const { result } = renderHook(() => useBrowserPool());
    await act(async () => {
      await result.current.createWebViewForTab('tab-nonce', 'https://example.com');
    });
    expect(useAppStore.getState().siblingWebviewNonce).toBe(before + 1);
  });

  it('does not evict on capacity (unbounded pool)', async () => {
    setMockBrowser();
    const { result } = renderHook(() => useBrowserPool());
    for (const id of ['a', 'b', 'c']) {
      await act(async () => {
        await result.current.createWebViewForTab(id, `https://${id}.com`);
      });
    }
    expect(result.current.isTabInPool('a')).toBe(true);
    expect(result.current.isTabInPool('b')).toBe(true);
    expect(result.current.isTabInPool('c')).toBe(true);
  });

  it('coalesces concurrent duplicate creation for the same tab', async () => {
    let resolveCreate: ((v: string | null) => void) | undefined;
    const createForTab = vi.fn().mockImplementation(
      () =>
        new Promise<string | null>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    setMockBrowser({ createForTab });

    const { result } = renderHook(() => useBrowserPool());

    const first = result.current.createWebViewForTab('tab-1', 'https://example.com');
    const second = result.current.createWebViewForTab('tab-1', 'https://example.com');

    await act(async () => {
      resolveCreate?.(null);
      await Promise.all([first, second]);
    });

    expect(createForTab).toHaveBeenCalledTimes(1);
    expect(result.current.isTabInPool('tab-1')).toBe(true);
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
