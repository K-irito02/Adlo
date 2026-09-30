import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBrowserMetaSubscription } from './useBrowserMetaSubscription';

vi.mock('@shared/env', () => ({
  isTauriShell: () => true,
}));

const { getState } = vi.hoisted(() => ({ getState: vi.fn() }));
vi.mock('@stores', () => ({ useAppStore: { getState } }));

type MetaChangedCb = (tabId: string, meta: { title: string; favicon: string; url: string }) => void;

function setMockBrowser(overrides: Record<string, unknown> = {}) {
  (window as unknown as Record<string, unknown>).digitalLife = {
    browser: { ...overrides },
  };
}

describe('useBrowserMetaSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as unknown as Record<string, unknown>).digitalLife;
  });

  it('ignores meta from a non-browser WebView such as the reserved dsh view', () => {
    const listener = vi.fn((_cb: MetaChangedCb) => () => {});
    setMockBrowser({ onMetaChanged: listener });
    const browserUpdateTab = vi.fn();
    getState.mockReturnValue({ browserTabs: [], browserUpdateTab });
    const handlePageMeta = vi.fn();

    renderHook(() => useBrowserMetaSubscription(handlePageMeta));
    const callback = listener.mock.calls[0][0];
    callback('dsh', {
      title: 'DeepSeek Harness',
      favicon: 'https://dsh/favicon.ico',
      url: 'http://127.0.0.1:3080/',
    });

    expect(browserUpdateTab).not.toHaveBeenCalled();
    expect(handlePageMeta).not.toHaveBeenCalled();
  });

  it('ignores meta from any unknown tab id, not just the reserved dsh', () => {
    const listener = vi.fn((_cb: MetaChangedCb) => () => {});
    setMockBrowser({ onMetaChanged: listener });
    const browserUpdateTab = vi.fn();
    getState.mockReturnValue({
      browserTabs: [{ id: 'browser-1', url: 'https://a.example' }],
      browserUpdateTab,
    });
    const handlePageMeta = vi.fn();

    renderHook(() => useBrowserMetaSubscription(handlePageMeta));
    const callback = listener.mock.calls[0][0];
    callback('some-orphan-view', {
      title: 'X',
      favicon: 'https://x.example/favicon.ico',
      url: 'https://x.example/',
    });

    expect(browserUpdateTab).not.toHaveBeenCalled();
    expect(handlePageMeta).not.toHaveBeenCalled();
  });

  it('drops meta with an empty tab id instead of feeding it downstream', () => {
    const listener = vi.fn((_cb: MetaChangedCb) => () => {});
    setMockBrowser({ onMetaChanged: listener });
    const browserUpdateTab = vi.fn();
    getState.mockReturnValue({
      browserTabs: [{ id: 'browser-1', url: 'https://a.example' }],
      browserUpdateTab,
    });
    const handlePageMeta = vi.fn();

    renderHook(() => useBrowserMetaSubscription(handlePageMeta));
    const callback = listener.mock.calls[0][0];
    callback('', {
      title: 'X',
      favicon: 'https://x.example/favicon.ico',
      url: 'https://x.example/',
    });

    expect(browserUpdateTab).not.toHaveBeenCalled();
    expect(handlePageMeta).not.toHaveBeenCalled();
  });

  it('processes meta for a known browser tab and syncs its URL', () => {
    const listener = vi.fn((_cb: MetaChangedCb) => () => {});
    setMockBrowser({ onMetaChanged: listener });
    const browserUpdateTab = vi.fn();
    getState.mockReturnValue({
      browserTabs: [{ id: 'browser-1', url: 'https://a.example' }],
      browserUpdateTab,
    });
    const handlePageMeta = vi.fn();

    renderHook(() => useBrowserMetaSubscription(handlePageMeta));
    const callback = listener.mock.calls[0][0];
    callback('browser-1', {
      title: 'A',
      favicon: 'https://a.example/favicon.ico',
      url: 'https://a.example/page',
    });

    expect(browserUpdateTab).toHaveBeenCalledWith('browser-1', { url: expect.any(String) });
    expect(handlePageMeta).toHaveBeenCalledTimes(1);
  });
});
