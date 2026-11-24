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

  it('initializes with browserShareProfile true', () => {
    const { get } = createMockStore();
    expect(get().browserShareProfile).toBe(true);
  });

  it('setBrowserShareProfile sets the flag', () => {
    const { get } = createMockStore();
    const setShareProfile = get().setBrowserShareProfile as (value: boolean) => void;
    setShareProfile(false);
    expect(get().browserShareProfile).toBe(false);
  });

  it('new tabs snapshot the shared-profile setting at creation time', () => {
    const { get } = createMockStore();
    const s = get() as Record<string, unknown>;
    s.browserTabs = [];
    s.browserActiveTabId = '';
    const setShare = s.setBrowserShareProfile as (value: boolean) => void;
    const navigate = s.browserNavigateActiveTab as (url: string, title?: string) => void;
    setShare(false);
    navigate('https://example.com', 'Example');
    const tabs = () => get().browserTabs as { shareProfile?: boolean }[];
    expect(tabs()[0].shareProfile).toBe(false);
    // 后续切换设置不影响已建标签的快照（挂起重建/重启沿用）。
    setShare(true);
    expect(tabs()[0].shareProfile).toBe(false);
  });

  it('panel-created tabs snapshot the shared-profile setting too', () => {
    const { get } = createMockStore();
    const s = get() as Record<string, unknown>;
    s.browserTabs = [];
    s.browserActiveTabId = '';
    (s.setBrowserShareProfile as (value: boolean) => void)(false);
    (s.browserNavigatePanelTab as (url: string) => void)('https://example.com');
    expect((get().browserTabs as { shareProfile?: boolean }[])[0].shareProfile).toBe(false);
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

  function panelTab(id: string, sortOrder: number) {
    return {
      id,
      workspaceId: 'ws-1',
      title: id,
      url: `https://${id}.example`,
      isPinned: false,
      isPlayingAudio: false,
      isAudioMuted: false,
      sortOrder,
    };
  }

  function centerTab(id: string) {
    return { ...panelTab(id, 99), location: 'center' as const, url: 'https://center.example' };
  }

  it('browserNavigatePanelTab 绝不导航中心标签：全局活动指向中心时回退首个面板标签', () => {
    const { get } = createMockStore();
    const s = get() as Record<string, unknown>;
    s.browserTabs = [panelTab('p1', 0), panelTab('p2', 1), centerTab('c1')];
    s.browserActiveTabId = 'c1';
    (get() as unknown as BrowserSlice).browserNavigatePanelTab('https://new.example', 'New');
    const tabs = get().browserTabs as { id: string; url: string; location?: string }[];
    // 中心标签 untouched
    expect(tabs.find((t) => t.id === 'c1')?.url).toBe('https://center.example');
    // 回退首个面板标签并将其设为活动
    expect(tabs.find((t) => t.id === 'p1')?.url).toBe('https://new.example');
    expect(tabs.find((t) => t.id === 'p2')?.url).toBe('https://p2.example');
    expect(get().browserActiveTabId).toBe('p1');
    expect(tabs).toHaveLength(3);
  });

  it('browserNavigatePanelTab 无面板标签时新建面板标签（事项 6：面板空时搜索建新标签）', () => {
    const { get } = createMockStore();
    const s = get() as Record<string, unknown>;
    s.browserTabs = [centerTab('c1')];
    s.browserActiveTabId = 'c1';
    (get() as unknown as BrowserSlice).browserNavigatePanelTab('https://new.example');
    const tabs = get().browserTabs as { id: string; url: string; location?: string }[];
    expect(tabs).toHaveLength(2);
    expect(tabs.find((t) => t.id === 'c1')?.url).toBe('https://center.example');
    const created = tabs.find((t) => t.id !== 'c1');
    expect(created?.url).toBe('https://new.example');
    expect(created?.location).not.toBe('center');
    expect(get().browserActiveTabId).toBe(created?.id);
  });

  it('browserNavigatePanelTab 活动为面板标签时就地导航', () => {
    const { get } = createMockStore();
    const s = get() as Record<string, unknown>;
    s.browserTabs = [panelTab('p1', 0), centerTab('c1')];
    s.browserActiveTabId = 'p1';
    (get() as unknown as BrowserSlice).browserNavigatePanelTab('https://new.example');
    const tabs = get().browserTabs as { id: string; url: string }[];
    expect(tabs).toHaveLength(2);
    expect(tabs.find((t) => t.id === 'p1')?.url).toBe('https://new.example');
    expect(tabs.find((t) => t.id === 'c1')?.url).toBe('https://center.example');
  });
});
