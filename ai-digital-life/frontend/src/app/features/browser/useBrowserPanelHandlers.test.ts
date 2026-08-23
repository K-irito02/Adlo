import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBrowserPanelHandlers } from './useBrowserPanelHandlers';

function setup(browserNavigateInPlace: boolean) {
  const browserOpenTab = vi.fn();
  const browserNavigateActiveTab = vi.fn();
  const browserSelectTab = vi.fn();
  const setBrowserNavigateInPlace = vi.fn();
  const expectedNavigationUrlRef = { current: null } as React.MutableRefObject<{
    url: string;
    at: number;
    tabId: string | null;
  } | null>;
  const { result } = renderHook(() =>
    useBrowserPanelHandlers({
      browserOpenTab,
      browserNavigateActiveTab,
      browserSelectTab,
      browserNavigateInPlace,
      setBrowserNavigateInPlace,
      expectedNavigationUrlRef,
    }),
  );
  return {
    result,
    browserOpenTab,
    browserNavigateActiveTab,
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
    const { result, browserNavigateActiveTab, browserSelectTab, browserOpenTab } = setup(true);
    act(() => result.current.handleOpenTabFromTree('https://x.com'));
    expect(browserNavigateActiveTab).toHaveBeenCalledWith('https://x.com');
    expect(browserSelectTab).not.toHaveBeenCalled();
    expect(browserOpenTab).not.toHaveBeenCalled();
  });

  it('existing tab switch still unaffected by toggle', () => {
    const { result, browserSelectTab, browserNavigateActiveTab } = setup(true);
    act(() => result.current.handleOpenTabFromTree('https://x.com', 'tab-1'));
    expect(browserSelectTab).toHaveBeenCalledWith('tab-1');
    expect(browserNavigateActiveTab).not.toHaveBeenCalled();
  });

  it('records expected navigation URL (with timestamp) on explicit tree open', () => {
    const { result, expectedNavigationUrlRef } = setup(true);
    act(() => result.current.handleOpenTabFromTree('https://x.com'));
    const expected = expectedNavigationUrlRef.current;
    expect(expected).not.toBeNull();
    expect(expected?.url).toBe('https://x.com');
    expect(expected?.at).toBeGreaterThan(0);
  });

  it('does NOT record expected navigation when switching to an existing tab', () => {
    const { result, expectedNavigationUrlRef } = setup(true);
    act(() => result.current.handleOpenTabFromTree('https://x.com', 'tab-1'));
    expect(expectedNavigationUrlRef.current).toBeNull();
  });
});
