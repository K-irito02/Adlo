import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBrowserPanelHandlers } from './useBrowserPanelHandlers';
import type { ExpectedNavigationRef } from './browserUrlUtils';

function setup(browserNavigateInPlace: boolean, activeTabId = 'tab-active') {
  const browserOpenTab = vi.fn();
  const browserNavigatePanelTab = vi.fn();
  const browserSelectTab = vi.fn();
  const setBrowserNavigateInPlace = vi.fn();
  const getActiveTabId = vi.fn(() => activeTabId);
  const expectedNavigationUrlRef: ExpectedNavigationRef = { current: null };
  const { result } = renderHook(() =>
    useBrowserPanelHandlers({
      browserOpenTab,
      browserNavigatePanelTab,
      browserSelectTab,
      browserNavigateInPlace,
      setBrowserNavigateInPlace,
      getActiveTabId,
      expectedNavigationUrlRef,
    }),
  );
  return {
    result,
    browserOpenTab,
    browserNavigatePanelTab,
    browserSelectTab,
    expectedNavigationUrlRef,
  };
}

describe('useBrowserPanelHandlers.handleAlwaysNewTab', () => {
  it('opens a new tab regardless of the navigate-in-place toggle', () => {
    for (const inPlace of [true, false]) {
      const { result, browserOpenTab } = setup(inPlace);
      act(() => result.current.handleAlwaysNewTab('New tab page'));
      expect(browserOpenTab).toHaveBeenCalledWith(undefined, 'New tab page');
      expect(browserOpenTab).toHaveBeenCalledTimes(1);
    }
  });
});

describe('useBrowserPanelHandlers.handleOpenTabFromTree (regression)', () => {
  it('keeps respecting the toggle', () => {
    const { result, browserNavigatePanelTab, browserSelectTab, browserOpenTab } = setup(true);
    act(() => result.current.handleOpenTabFromTree('https://x.com'));
    expect(browserNavigatePanelTab).toHaveBeenCalledWith('https://x.com');
    expect(browserSelectTab).not.toHaveBeenCalled();
    expect(browserOpenTab).not.toHaveBeenCalled();
  });

  it('existing tab switch still unaffected by toggle', () => {
    const { result, browserSelectTab, browserNavigatePanelTab } = setup(true);
    act(() => result.current.handleOpenTabFromTree('https://x.com', 'tab-1'));
    expect(browserSelectTab).toHaveBeenCalledWith('tab-1');
    expect(browserNavigatePanelTab).not.toHaveBeenCalled();
  });

  it('records expected navigation URL (with timestamp + bound tabId) on explicit tree open', () => {
    const { result, expectedNavigationUrlRef } = setup(true);
    act(() => result.current.handleOpenTabFromTree('https://x.com'));
    const expected = expectedNavigationUrlRef.current;
    expect(expected).not.toBeNull();
    expect(expected?.url).toBe('https://x.com');
    expect(expected?.at).toBeGreaterThan(0);
    // 就地打开绑定当前活动 tab id（H1-C：防后台 tab 事件误吞期望）
    expect(expected?.tabId).toBe('tab-active');
  });

  it('binds the newly-created tab id when opening a new tab (H1-C)', () => {
    const { result, expectedNavigationUrlRef } = setup(false);
    act(() => result.current.handleOpenTabFromTree('https://x.com'));
    const expected = expectedNavigationUrlRef.current;
    expect(expected?.tabId).toBe('tab-active');
  });

  it('does NOT record expected navigation when switching to an existing tab', () => {
    const { result, expectedNavigationUrlRef } = setup(true);
    act(() => result.current.handleOpenTabFromTree('https://x.com', 'tab-1'));
    expect(expectedNavigationUrlRef.current).toBeNull();
  });

  it('裸 3080 树点击走后端真实入口并保持面板归属（事项 2）', async () => {
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      dsh: {
        open: vi.fn(async () => ({
          ok: true,
          data: { url: 'http://127.0.0.1:3080/?token=tree1', freedPort: false },
        })),
      },
    };
    try {
      const expectedNavigationUrlRef: {
        current: { url: string; at: number; tabId: string | null } | null;
      } = { current: null };
      const browserNavigatePanelTab = vi.fn();
      const { result } = renderHook(() =>
        useBrowserPanelHandlers({
          browserOpenTab: vi.fn(),
          browserNavigatePanelTab,
          browserSelectTab: vi.fn(),
          browserNavigateInPlace: true,
          setBrowserNavigateInPlace: vi.fn(),
          getActiveTabId: () => 'tab-active',
          expectedNavigationUrlRef,
          t: { dshPortFreed: 'FREED' },
        }),
      );

      await act(async () => {
        result.current.handleOpenTabFromTree('http://127.0.0.1:3080');
      });

      expect(browserNavigatePanelTab).toHaveBeenCalledWith('http://127.0.0.1:3080/?token=tree1');
      expect(expectedNavigationUrlRef.current?.url).toBe('http://127.0.0.1:3080/?token=tree1');
    } finally {
      delete (window as unknown as { digitalLife?: unknown }).digitalLife;
    }
  });
});
