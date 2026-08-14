import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBrowserBookmarkSlice } from '../browserBookmarkSlice';
import type { BrowserBookmarkSlice } from '../browserBookmarkSlice';

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
  const slice = createBrowserBookmarkSlice(set as never, get as never);
  state = { ...slice };
  return { get };
}

describe('browserCreateBookmarkEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds a bookmark to browserBookmarks when url is new', () => {
    const { get } = createMockStore();
    (get() as unknown as BrowserBookmarkSlice).browserCreateBookmarkEntry({
      url: 'https://example.com',
      title: 'Example',
    });
    const state = get() as unknown as BrowserBookmarkSlice;
    expect(state.browserBookmarks).toContainEqual({ url: 'https://example.com', title: 'Example' });
  });

  it('does not duplicate an existing browserBookmark url', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    slice.browserCreateBookmarkEntry({ url: 'https://example.com', title: 'Example' });
    slice.browserCreateBookmarkEntry({ url: 'https://example.com', title: 'Renamed' });
    const state = get() as unknown as BrowserBookmarkSlice;
    expect(state.browserBookmarks.filter((b) => b.url === 'https://example.com')).toHaveLength(1);
  });

  it('appends a folder tab item when folderId provided', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    const folderId = 'f1';
    const raw0 = get() as Record<string, unknown>;
    raw0.browserTabFolders = [{ id: folderId, name: 'F', createdAt: 0, tabs: [] }];
    slice.browserCreateBookmarkEntry({
      url: 'https://example.com',
      title: 'Example',
      folderId,
    });
    const raw = get() as Record<string, unknown>;
    const folders = raw.browserTabFolders as {
      id: string;
      name: string;
      createdAt: number;
      tabs?: { tabId: string; url: string; title: string }[];
    }[];
    const folder = folders.find((f) => f.id === folderId)!;
    expect(folder.tabs).toHaveLength(1);
    expect(folder.tabs![0]).toMatchObject({ url: 'https://example.com', title: 'Example' });
    expect(folder.tabs![0].tabId).toBeTruthy();
  });

  it('appends a workspace bookmark entry when workspaceId provided', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    slice.browserCreateBookmarkEntry({
      url: 'https://example.com',
      title: 'Example',
      workspaceId: 'ws1',
    });
    const state = get() as unknown as BrowserBookmarkSlice;
    expect(state.browserWorkspaceBookmarks['ws1']).toHaveLength(1);
    expect(state.browserWorkspaceBookmarks['ws1'][0]).toMatchObject({
      url: 'https://example.com',
      title: 'Example',
    });
  });

  it('does not open or create a tab', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    slice.browserCreateBookmarkEntry({ url: 'https://example.com', title: 'Example' });
    const raw = get() as Record<string, unknown>;
    expect(raw.browserTabs).toBeUndefined();
  });
});
