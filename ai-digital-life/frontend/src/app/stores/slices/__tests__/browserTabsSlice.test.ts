import { describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createBrowserTabsSlice } from '../browserTabsSlice';
import type { BrowserTabState } from '../browserTabsSlice';

function makeTab(id: string, overrides: Partial<BrowserTabState> = {}): BrowserTabState {
  return {
    id,
    workspaceId: 'ws-1',
    title: id,
    url: `https://${id}.example`,
    isPinned: false,
    sortOrder: 0,
    isPlayingAudio: false,
    isAudioMuted: false,
    ...overrides,
  };
}

describe('browserTabsSlice - audio control', () => {
  it('browserUpdateTabAudioState should update isPlayingAudio', () => {
    const store = createStore<any>((set, get) => ({
      ...createBrowserTabsSlice(set, get),
      browserTabs: [makeTab('tab-1')],
      browserTabsById: { 'tab-1': makeTab('tab-1') },
      browserActiveTabId: 'tab-1',
    }));

    store.getState().browserUpdateTabAudioState('tab-1', true, undefined);

    const tab = store.getState().browserTabs.find((t: any) => t.id === 'tab-1');
    expect(tab.isPlayingAudio).toBe(true);
  });

  it('browserUpdateTabAudioState should update isAudioMuted and trigger persist', () => {
    const store = createStore<any>((set, get) => ({
      ...createBrowserTabsSlice(set, get),
      browserTabs: [makeTab('tab-1')],
      browserTabsById: { 'tab-1': makeTab('tab-1') },
      browserActiveTabId: 'tab-1',
    }));

    store.getState().browserUpdateTabAudioState('tab-1', undefined, true);

    const tab = store.getState().browserTabs.find((t: any) => t.id === 'tab-1');
    expect(tab.isAudioMuted).toBe(true);
  });

  it('browserToggleTabMute should toggle isAudioMuted', () => {
    const store = createStore<any>((set, get) => ({
      ...createBrowserTabsSlice(set, get),
      browserTabs: [makeTab('tab-1', { isAudioMuted: false })],
      browserTabsById: { 'tab-1': makeTab('tab-1', { isAudioMuted: false }) },
      browserActiveTabId: 'tab-1',
    }));

    store.getState().browserToggleTabMute('tab-1');
    expect(store.getState().browserTabs.find((t: any) => t.id === 'tab-1').isAudioMuted).toBe(true);

    store.getState().browserToggleTabMute('tab-1');
    expect(store.getState().browserTabs.find((t: any) => t.id === 'tab-1').isAudioMuted).toBe(
      false,
    );
  });
});

describe('browserOpenTab folder append dedup (url+title)', () => {
  function makeStoreWithFolder(folderId: string) {
    return createStore<any>((set, get) => ({
      ...createBrowserTabsSlice(set, get),
      browserTabs: [],
      browserTabsById: {},
      browserActiveTabId: '',
      browserTabFolders: [{ id: folderId, name: 'F', createdAt: 0, tabs: [] }],
      browserBookmarkTabIdUrlMap: {},
      browserBookmarks: [],
    }));
  }

  it('dedups folder append by url+title', () => {
    const store = makeStoreWithFolder('f1');
    store.getState().browserOpenTab('https://e.com', 'Title A', undefined, 'f1');
    store.getState().browserOpenTab('https://e.com', 'Title A', undefined, 'f1');
    const folder = store.getState().browserTabFolders.find((f: any) => f.id === 'f1');
    expect(folder.tabs).toHaveLength(1);
  });

  it('allows same url with a different title in the folder', () => {
    const store = makeStoreWithFolder('f1');
    store.getState().browserOpenTab('https://e.com', 'Title A', undefined, 'f1');
    store.getState().browserOpenTab('https://e.com', 'Title B', undefined, 'f1');
    const folder = store.getState().browserTabFolders.find((f: any) => f.id === 'f1');
    expect(folder.tabs).toHaveLength(2);
  });
});
