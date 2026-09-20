import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildBrowserTabUrlMap, markResolvedTitles } from '../composite';
import { hydrateAll, resetHydrationForTest } from '../hydrate';

describe('markResolvedTitles', () => {
  it('marks tabs with a real title as resolved', () => {
    const tabs = [{ id: 'browser-1', title: 'Example', url: 'https://example.com' }];
    expect(markResolvedTitles(tabs as never)[0].titleResolved).toBe(true);
  });

  it('keeps an explicit titleResolved flag untouched', () => {
    const tabs = [{ id: 'browser-1', title: '新建标签页', url: '', titleResolved: false }];
    expect(markResolvedTitles(tabs as never)[0].titleResolved).toBe(false);
  });

  it('does not mutate the input array', () => {
    const tabs = [{ id: 'browser-1', title: 'Example', url: 'https://example.com' }];
    markResolvedTitles(tabs as never);
    expect('titleResolved' in tabs[0]).toBe(false);
  });
});

describe('buildBrowserTabUrlMap', () => {
  it('prefers workspace bookmark urls, then folder tab urls, then the persisted map', () => {
    const map = buildBrowserTabUrlMap({
      tabs: [{ id: 'tab-b', url: 'https://from-tab.test' }] as never,
      workspaceBookmarks: { ws1: [{ tabId: 'tab-a', url: 'https://from-bookmark.test' }] } as never,
      tabFolders: [{ tabs: [{ tabId: 'tab-b' }] }] as never,
      persistedMap: { 'tab-c': 'https://from-persisted.test' },
    });
    expect(map).toEqual({
      'tab-a': 'https://from-bookmark.test',
      'tab-b': 'https://from-tab.test',
      'tab-c': 'https://from-persisted.test',
    });
  });
});

describe('composite hydration is defensive', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.clear();
    resetHydrationForTest();
  });

  it('does not throw and keeps browserTabs at its fallback when the raw value is not an array', () => {
    localStorage.setItem('adl:browser.tabs', JSON.stringify({ id: 'browser-1', url: 'x' }));

    let patch: Partial<Record<string, unknown>> = {};
    expect(() => {
      patch = hydrateAll().patch as Partial<Record<string, unknown>>;
    }).not.toThrow();

    expect(patch.browserTabs).toEqual([]);
  });
});
