import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBrowserMetaSubscription } from './useBrowserMetaSubscription';
import { normalizeUrlForCompare } from './browserUrlUtils';

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
    const meta = {
      title: 'A',
      favicon: 'https://a.example/favicon.ico',
      url: 'https://a.example/page',
    };
    callback('browser-1', meta);

    expect(browserUpdateTab).toHaveBeenCalledWith('browser-1', {
      url: normalizeUrlForCompare(meta.url),
    });
    expect(handlePageMeta).toHaveBeenCalledTimes(1);
    expect(handlePageMeta).toHaveBeenCalledWith(meta);
  });

  it('attributes a background known tab without touching the active tab', () => {
    const listener = vi.fn((_cb: MetaChangedCb) => () => {});
    setMockBrowser({ onMetaChanged: listener });
    const browserUpdateTab = vi.fn();
    getState.mockReturnValue({
      browserTabs: [
        { id: 'browser-1', url: 'https://a.example' },
        { id: 'browser-2', url: 'https://b.example' },
      ],
      browserUpdateTab,
    });
    const handlePageMeta = vi.fn();

    renderHook(() => useBrowserMetaSubscription(handlePageMeta));
    const callback = listener.mock.calls[0][0];
    const meta = {
      title: 'B2',
      favicon: 'https://b.example/favicon.ico',
      url: 'https://b.example/page2',
    };
    callback('browser-2', meta);

    expect(browserUpdateTab).toHaveBeenCalledTimes(1);
    expect(browserUpdateTab).toHaveBeenCalledWith('browser-2', {
      url: normalizeUrlForCompare(meta.url),
    });
    expect(handlePageMeta).toHaveBeenCalledTimes(1);
    expect(handlePageMeta).toHaveBeenCalledWith(meta);
  });

  it('drops malformed meta without throwing or writing', () => {
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
    expect(() => callback('browser-1', undefined as never)).not.toThrow();
    expect(() =>
      callback('browser-1', { title: 'X', favicon: '', url: undefined } as never),
    ).not.toThrow();

    expect(browserUpdateTab).not.toHaveBeenCalled();
    expect(handlePageMeta).not.toHaveBeenCalled();
  });
});
