import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBrowserNewTabSubscription } from './useBrowserNewTabSubscription';

vi.mock('../../../shared/env', () => ({
  isTauriShell: () => true,
}));

function setMockBrowser(overrides: Record<string, unknown> = {}) {
  (window as unknown as Record<string, unknown>).digitalLife = {
    browser: { ...overrides },
  };
}

describe('useBrowserNewTabSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as unknown as Record<string, unknown>).digitalLife;
  });

  it('opens a new tab when a new-window request arrives', () => {
    const listener = vi.fn((_cb: (url: string) => void) => () => {});
    setMockBrowser({ onOpenNewTab: listener });
    const browserOpenTab = vi.fn();

    renderHook(() => useBrowserNewTabSubscription(browserOpenTab));

    expect(listener).toHaveBeenCalledTimes(1);
    const callback = listener.mock.calls[0][0];
    callback('https://www.bilibili.com/video/BV1xx');

    expect(browserOpenTab).toHaveBeenCalledWith('https://www.bilibili.com/video/BV1xx');
  });

  it('ignores empty URLs', () => {
    const listener = vi.fn((_cb: (url: string) => void) => () => {});
    setMockBrowser({ onOpenNewTab: listener });
    const browserOpenTab = vi.fn();

    renderHook(() => useBrowserNewTabSubscription(browserOpenTab));

    const callback = listener.mock.calls[0][0];
    callback('');
    expect(browserOpenTab).not.toHaveBeenCalled();
  });

  it('unsubscribes on unmount', () => {
    const unsub = vi.fn();
    const listener = vi.fn(() => unsub);
    setMockBrowser({ onOpenNewTab: listener });

    const { unmount } = renderHook(() => useBrowserNewTabSubscription(vi.fn()));
    unmount();
    expect(unsub).toHaveBeenCalled();
  });
});
