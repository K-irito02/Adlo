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
  it('initializes with default navigator width', () => {
    const { get } = createMockStore();
    expect((get() as unknown as BrowserSlice).browserNavigatorWidth).toBe(240);
  });

  it('initializes with browserPersisted false', () => {
    const { get } = createMockStore();
    expect((get() as unknown as BrowserSlice).browserPersisted).toBe(false);
  });

  it('initializes with empty workspace id', () => {
    const { get } = createMockStore();
    expect((get() as unknown as BrowserSlice).browserWorkspaceId).toBe('');
  });

  it('initializes with navigateInPlace false', () => {
    const { get } = createMockStore();
    expect((get() as unknown as BrowserSlice).browserNavigateInPlace).toBe(false);
  });

  it('setBrowserPersisted sets the flag', () => {
    const { get } = createMockStore();
    (get() as unknown as BrowserSlice).setBrowserPersisted(true);
    expect((get() as unknown as BrowserSlice).browserPersisted).toBe(true);
  });

  it('setBrowserWorkspaceId sets the workspace id', () => {
    const { get } = createMockStore();
    (get() as unknown as BrowserSlice).setBrowserWorkspaceId('ws-1');
    expect((get() as unknown as BrowserSlice).browserWorkspaceId).toBe('ws-1');
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

  it('setBrowserNavigatorWidth clamps to min 180', () => {
    const { get } = createMockStore();
    (get() as unknown as BrowserSlice).setBrowserNavigatorWidth(0);
    expect((get() as unknown as BrowserSlice).browserNavigatorWidth).toBe(180);
  });

  it('setBrowserNavigatorWidth clamps to max 300', () => {
    const { get } = createMockStore();
    (get() as unknown as BrowserSlice).setBrowserNavigatorWidth(500);
    expect((get() as unknown as BrowserSlice).browserNavigatorWidth).toBe(300);
  });

  it('setBrowserNavigatorWidth sets within range', () => {
    const { get } = createMockStore();
    (get() as unknown as BrowserSlice).setBrowserNavigatorWidth(200);
    expect((get() as unknown as BrowserSlice).browserNavigatorWidth).toBe(200);
  });

  it('toggleBrowserNavigator toggles from false to true', () => {
    const { get } = createMockStore();
    (get() as unknown as BrowserSlice).toggleBrowserNavigator();
    const collapsed = (get() as Record<string, unknown>).navigatorCollapsedByTool as Record<
      string,
      boolean
    >;
    expect(collapsed.browser).toBe(true);
  });

  it('toggleBrowserNavigator toggles from true to false', () => {
    const { get } = createMockStore();
    (get() as unknown as BrowserSlice).toggleBrowserNavigator();
    (get() as unknown as BrowserSlice).toggleBrowserNavigator();
    const collapsed = (get() as Record<string, unknown>).navigatorCollapsedByTool as Record<
      string,
      boolean
    >;
    expect(collapsed.browser).toBe(false);
  });

  it('setBrowserNavigatorCollapsed sets browser collapsed', () => {
    const { get } = createMockStore();
    (get() as unknown as BrowserSlice).setBrowserNavigatorCollapsed(true);
    const collapsed = (get() as Record<string, unknown>).navigatorCollapsedByTool as Record<
      string,
      boolean
    >;
    expect(collapsed.browser).toBe(true);
  });

  it('setBrowserNavigatorCollapsed sets browser uncollapsed', () => {
    const { get } = createMockStore();
    (get() as unknown as BrowserSlice).setBrowserNavigatorCollapsed(false);
    const collapsed = (get() as Record<string, unknown>).navigatorCollapsedByTool as Record<
      string,
      boolean
    >;
    expect(collapsed.browser).toBe(false);
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
