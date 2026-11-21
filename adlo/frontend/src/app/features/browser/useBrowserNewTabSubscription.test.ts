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

  it('forwards the requesting tab and URL to the caller', () => {
    const listener = vi.fn((_cb: (request: { tabId: string; url: string }) => void) => () => {});
    setMockBrowser({ onOpenNewTab: listener });
    const onOpenNewTab = vi.fn();

    renderHook(() => useBrowserNewTabSubscription(onOpenNewTab));

    expect(listener).toHaveBeenCalledTimes(1);
    const callback = listener.mock.calls[0][0];
    callback({ tabId: 'browser-1', url: 'https://www.bilibili.com/video/BV1xx' });

    expect(onOpenNewTab).toHaveBeenCalledWith({
      tabId: 'browser-1',
      url: 'https://www.bilibili.com/video/BV1xx',
    });
  });

  it('ignores empty URLs', () => {
    const listener = vi.fn((_cb: (request: { tabId: string; url: string }) => void) => () => {});
    setMockBrowser({ onOpenNewTab: listener });
    const onOpenNewTab = vi.fn();

    renderHook(() => useBrowserNewTabSubscription(onOpenNewTab));

    const callback = listener.mock.calls[0][0];
    callback({ tabId: 'browser-1', url: '' });
    expect(onOpenNewTab).not.toHaveBeenCalled();
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
