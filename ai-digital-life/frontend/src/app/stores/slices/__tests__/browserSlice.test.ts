import { describe, it, expect } from 'vitest';
import { createBrowserSlice } from '../browserSlice';
import type { BrowserSlice } from '../browserSlice';

function createMockStore() {
  let state: Record<string, unknown> = {};
  const get = () => state;
  const set = (partial: unknown) => {
    if (typeof partial === 'function') {
      const next = (partial as (s: Record<string, unknown>) => Record<string, unknown>)(state);
      state = { ...state, ...next };
    } else {
      state = { ...state, ...(partial as Record<string, unknown>) };
    }
  };
  state = { ...createBrowserSlice(set as never, get as never) };
  return { get };
}

describe('browserSlice', () => {
  it('initializes with navigateInPlace false', () => {
    const { get } = createMockStore();
    expect((get() as unknown as BrowserSlice).browserNavigateInPlace).toBe(false);
  });

  it('setBrowserNavigateInPlace sets the flag', () => {
    const { get } = createMockStore();
    (get() as unknown as BrowserSlice).setBrowserNavigateInPlace(true);
    expect((get() as unknown as BrowserSlice).browserNavigateInPlace).toBe(true);
  });

  it('setBrowserNavigateInPlace toggles back', () => {
    const { get } = createMockStore();
    (get() as unknown as BrowserSlice).setBrowserNavigateInPlace(true);
    (get() as unknown as BrowserSlice).setBrowserNavigateInPlace(false);
    expect((get() as unknown as BrowserSlice).browserNavigateInPlace).toBe(false);
  });

  it('browserNavigateActiveTab creates a new tab when none exist', () => {
    const { get } = createMockStore();
    const s = get() as Record<string, unknown>;
    s.browserTabs = [];
    s.browserActiveTabId = '';
    (get() as unknown as BrowserSlice).browserNavigateActiveTab('https://example.com', 'Example');
    const state = get();
    const tabs = state.browserTabs as { id: string; url: string; title: string }[];
    expect(tabs).toHaveLength(1);
    expect(tabs[0].url).toBe('https://example.com');
    expect(tabs[0].title).toBe('Example');
  });

  it('browserNavigateActiveTab marks real title resolved, placeholder title unresolved (C1)', () => {
    const { get } = createMockStore();
    const s = get() as Record<string, unknown>;
    s.browserTabs = [];
    s.browserActiveTabId = '';
    const bs = get() as unknown as BrowserSlice;
    // 真实标题 → titleResolved: true
    bs.browserNavigateActiveTab('https://example.com', 'Example');
    let tabs = get().browserTabs as { titleResolved: boolean; title: string }[];
    expect(tabs[0].titleResolved).toBe(true);
    // 占位标题（如搜索 "Google: 搜索词" 也非占位，这里用 URL 占位）→ false
    bs.browserNavigateActiveTab('https://example.com', 'https://example.com');
    tabs = get().browserTabs as { titleResolved: boolean; title: string }[];
    expect(tabs[0].titleResolved).toBe(false);
  });

  it('browserNavigateActiveTab navigates existing tab in place', () => {
    const { get } = createMockStore();
    const s = get() as Record<string, unknown>;
    const tabId = 'tab-1';
    s.browserTabs = [
      {
        id: tabId,
        workspaceId: 'ws-1',
        title: 'Old',
        url: 'https://old.example',
        isPinned: false,
        isPlayingAudio: false,
        isAudioMuted: false,
        sortOrder: 0,
      },
    ];
    (s.browserTabsById as Record<string, unknown>) = { [tabId]: (s.browserTabs as unknown[])[0] };
    s.browserActiveTabId = tabId;
    (get() as unknown as BrowserSlice).browserNavigateActiveTab('https://new.example', 'New');
    const state = get();
    const tabs = state.browserTabs as { id: string; url: string; title: string }[];
    expect(tabs).toHaveLength(1);
    expect(tabs[0].url).toBe('https://new.example');
    expect(tabs[0].title).toBe('New');
  });
});
