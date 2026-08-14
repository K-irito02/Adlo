import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBrowserPanelHandlers } from './useBrowserPanelHandlers';

function setup(browserNavigateInPlace: boolean) {
  const browserOpenTab = vi.fn();
  const browserNavigateActiveTab = vi.fn();
  const browserSelectTab = vi.fn();
  const setBrowserNavigateInPlace = vi.fn();
  const { result } = renderHook(() =>
    useBrowserPanelHandlers({
      browserOpenTab,
      browserNavigateActiveTab,
      browserSelectTab,
      browserNavigateInPlace,
      setBrowserNavigateInPlace,
    }),
  );
  return { result, browserOpenTab, browserNavigateActiveTab, browserSelectTab };
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
});
