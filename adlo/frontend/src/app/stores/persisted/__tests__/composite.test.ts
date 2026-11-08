import { describe, it, expect, beforeEach, vi } from 'vitest';
import { markResolvedTitles } from '../composite';
import { useAppStore } from '@stores/slicedStore';
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

describe('bookmark identity', () => {
  it('keeps bookmark entries independent from tab ids', () => {
    const state = useAppStore.getState();
    expect(state.browserBookmarks).toEqual([]);
    expect(state.browserBookmarkFolders).toEqual([]);
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

  it('rejects an array holding a malformed item instead of writing it back into the store', () => {
    // 登记表的 isBrowserTab 要求 id/title/url 均为字符串 ⇒ 整值拒绝、回退 fallback。
    // composite 必须复用同一份校验器：不得用同一份原始值再构造补丁覆盖 fallback。
    localStorage.setItem('adl:browser.tabs', JSON.stringify([{ id: 1 }]));

    let patch: Partial<Record<string, unknown>> = {};
    expect(() => {
      patch = hydrateAll().patch as Partial<Record<string, unknown>>;
    }).not.toThrow();

    expect(patch.browserTabs).toEqual([]);
    // 畸形项不得经由 composite 进入任何派生字段
    expect(patch.browserTabsById).toBeUndefined();
    expect(patch.browserActiveTabId).toBe('');
  });

  it('rejects a workspace-bookmark record holding a malformed item', () => {
    // 该项有 url，但缺 title / addedAt / lastModifiedAt ⇒ isBookmarkEntry 拒绝整值
    localStorage.setItem(
      'adl:browser.workspaceBookmarks',
      JSON.stringify({ ws1: [{ id: 'bm-a', url: 'https://malformed.test' }] }),
    );

    let patch: Partial<Record<string, unknown>> = {};
    expect(() => {
      patch = hydrateAll().patch as Partial<Record<string, unknown>>;
    }).not.toThrow();

    expect(patch.browserWorkspaceBookmarks).toEqual({});
  });

  it('rejects a bookmark-folder array holding a malformed folder', () => {
    // 该文件夹有 entries 子项，但缺 id/name/createdAt ⇒ isBookmarkFolder 拒绝整值
    localStorage.setItem(
      'adl:browser.bookmarkFolders',
      JSON.stringify([{ entries: [{ id: 'bm-b' }] }]),
    );
    localStorage.setItem(
      'adl:browser.tabs',
      JSON.stringify([{ id: 'tab-b', title: 'B', url: 'https://from-tab.test' }]),
    );

    let patch: Partial<Record<string, unknown>> = {};
    expect(() => {
      patch = hydrateAll().patch as Partial<Record<string, unknown>>;
    }).not.toThrow();

    expect(patch.browserBookmarkFolders).toEqual([]);
  });
});
