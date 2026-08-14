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

  it('does not duplicate an existing browserBookmark with same url and title', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    slice.browserCreateBookmarkEntry({ url: 'https://example.com', title: 'Example' });
    slice.browserCreateBookmarkEntry({ url: 'https://example.com', title: 'Example' });
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

  it('does not duplicate a folder tab or tabIdUrlMap entry on repeated folderId calls', () => {
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
    const state = get() as unknown as BrowserBookmarkSlice;
    expect(Object.keys(state.browserBookmarkTabIdUrlMap)).toHaveLength(1);
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

  it('allows same url with different title in the same folder (path dedup = url+title)', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    const folderId = 'f1';
    (get() as Record<string, unknown>).browserTabFolders = [
      {
        id: folderId,
        name: 'F',
        createdAt: 0,
        tabs: [{ tabId: 'a', url: 'https://e.com', title: 'Title A' }],
      },
    ];
    slice.browserCreateBookmarkEntry({ url: 'https://e.com', title: 'Title B', folderId });
    const raw = get() as Record<string, unknown>;
    const folders = raw.browserTabFolders as {
      id: string;
      name: string;
      createdAt: number;
      tabs?: { tabId: string; url: string; title: string }[];
    }[];
    const folder = folders.find((f) => f.id === folderId)!;
    expect(folder.tabs).toHaveLength(2);
    expect(folder.tabs![1]).toMatchObject({ url: 'https://e.com', title: 'Title B' });
  });

  it('blocks same url + same title in the same folder', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    const folderId = 'f1';
    (get() as Record<string, unknown>).browserTabFolders = [
      {
        id: folderId,
        name: 'F',
        createdAt: 0,
        tabs: [{ tabId: 'a', url: 'https://e.com', title: 'Title A' }],
      },
    ];
    slice.browserCreateBookmarkEntry({ url: 'https://e.com', title: 'Title A', folderId });
    const raw = get() as Record<string, unknown>;
    const folders = raw.browserTabFolders as {
      id: string;
      name: string;
      createdAt: number;
      tabs?: { tabId: string; url: string; title: string }[];
    }[];
    const folder = folders.find((f) => f.id === folderId)!;
    expect(folder.tabs).toHaveLength(1);
  });

  it('allows same url + same title in a different folder', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserTabFolders = [
      {
        id: 'f1',
        name: 'F1',
        createdAt: 0,
        tabs: [{ tabId: 'a', url: 'https://e.com', title: 'Title A' }],
      },
      { id: 'f2', name: 'F2', createdAt: 0, tabs: [] },
    ];
    slice.browserCreateBookmarkEntry({ url: 'https://e.com', title: 'Title A', folderId: 'f2' });
    const raw = get() as Record<string, unknown>;
    const folders = raw.browserTabFolders as {
      id: string;
      name: string;
      createdAt: number;
      tabs?: { tabId: string; url: string; title: string }[];
    }[];
    const f1 = folders.find((f) => f.id === 'f1')!;
    const f2 = folders.find((f) => f.id === 'f2')!;
    expect(f1.tabs).toHaveLength(1);
    expect(f2.tabs).toHaveLength(1);
  });

  it('allows same url with different title in the same workspace', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserWorkspaceBookmarks = {
      ws1: [{ tabId: 'a', url: 'https://e.com', title: 'Title A' }],
    };
    slice.browserCreateBookmarkEntry({
      url: 'https://e.com',
      title: 'Title B',
      workspaceId: 'ws1',
    });
    const state = get() as unknown as BrowserBookmarkSlice;
    expect(state.browserWorkspaceBookmarks['ws1']).toHaveLength(2);
  });

  it('blocks same url + same title in the same workspace', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserWorkspaceBookmarks = {
      ws1: [{ tabId: 'a', url: 'https://e.com', title: 'Title A' }],
    };
    slice.browserCreateBookmarkEntry({
      url: 'https://e.com',
      title: 'Title A',
      workspaceId: 'ws1',
    });
    const state = get() as unknown as BrowserBookmarkSlice;
    expect(state.browserWorkspaceBookmarks['ws1']).toHaveLength(1);
  });

  it('browserBookmarks global dedup is url+title (same url different title both stored)', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    slice.browserCreateBookmarkEntry({ url: 'https://e.com', title: 'Title A' });
    slice.browserCreateBookmarkEntry({ url: 'https://e.com', title: 'Title B' });
    const state = get() as unknown as BrowserBookmarkSlice;
    expect(state.browserBookmarks).toHaveLength(2);
    expect(state.browserBookmarks).toEqual([
      { url: 'https://e.com', title: 'Title A' },
      { url: 'https://e.com', title: 'Title B' },
    ]);
  });

  it('browserCreateBookmarkEntry returns {ok:false, pathLabel} on folder dedup collision', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as any).browserTabFolders = [
      {
        id: 'f1',
        name: '工具',
        createdAt: 0,
        tabs: [{ tabId: 'a', url: 'https://e.com', title: 'Title A' }],
      },
    ];
    (get() as any).recentWorkspaces = [];
    const result = slice.browserCreateBookmarkEntry({
      url: 'https://e.com',
      title: 'Title A',
      folderId: 'f1',
    });
    expect(result).toEqual({ ok: false, pathLabel: '工具' });
  });

  it('browserCreateBookmarkEntry returns {ok:true} when no collision', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    const result = slice.browserCreateBookmarkEntry({
      url: 'https://e.com',
      title: 'Title A',
    });
    expect(result).toEqual({ ok: true });
  });
});

describe('browserUpdateSavedBookmark', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates url/title of a folder.tabs entry', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    const folderId = 'f1';
    (get() as Record<string, unknown>).browserTabFolders = [
      {
        id: folderId,
        name: 'F',
        createdAt: 0,
        tabs: [{ tabId: 'a', url: 'https://old.com', title: 'Old' }],
      },
    ];
    const result = slice.browserUpdateSavedBookmark('a', {
      url: 'https://new.com',
      title: 'New',
    });
    expect(result).toEqual({ ok: true });
    const raw = get() as Record<string, unknown>;
    const folders = raw.browserTabFolders as {
      id: string;
      tabs?: { tabId: string; url: string; title: string }[];
    }[];
    const folder = folders.find((f) => f.id === folderId)!;
    expect(folder.tabs).toHaveLength(1);
    expect(folder.tabs![0]).toMatchObject({ tabId: 'a', url: 'https://new.com', title: 'New' });
  });

  it('updates url/title of a workspaceBookmarks entry', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserWorkspaceBookmarks = {
      ws1: [{ tabId: 'a', url: 'https://old.com', title: 'Old' }],
    };
    const result = slice.browserUpdateSavedBookmark('a', {
      url: 'https://new.com',
      title: 'New',
    });
    expect(result).toEqual({ ok: true });
    const state = get() as unknown as BrowserBookmarkSlice;
    expect(state.browserWorkspaceBookmarks['ws1'][0]).toMatchObject({
      tabId: 'a',
      url: 'https://new.com',
      title: 'New',
    });
  });

  it('syncs browserBookmarks after updating a folder entry', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserTabFolders = [
      {
        id: 'f1',
        name: 'F',
        createdAt: 0,
        tabs: [{ tabId: 'a', url: 'https://old.com', title: 'Old' }],
      },
    ];
    (get() as Record<string, unknown>).browserBookmarks = [
      { url: 'https://old.com', title: 'Old' },
    ];
    const result = slice.browserUpdateSavedBookmark('a', {
      url: 'https://new.com',
      title: 'New',
    });
    expect(result).toEqual({ ok: true });
    const state = get() as unknown as BrowserBookmarkSlice;
    expect(state.browserBookmarks).toContainEqual({ url: 'https://new.com', title: 'New' });
    expect(state.browserBookmarks.find((b) => b.url === 'https://old.com')).toBeUndefined();
  });

  it('returns { ok: false, pathLabel } and leaves state unchanged on same-path url+title collision', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserTabFolders = [
      {
        id: 'f1',
        name: 'F',
        createdAt: 0,
        tabs: [
          { tabId: 'a', url: 'https://e.com', title: 'Title A' },
          { tabId: 'b', url: 'https://e.com', title: 'Title A' },
        ],
      },
    ];
    (get() as Record<string, unknown>).recentWorkspaces = [];
    const before = JSON.stringify(get().browserTabFolders);
    const result = slice.browserUpdateSavedBookmark('a', {
      url: 'https://e.com',
      title: 'Title A',
    });
    expect(result).toEqual({ ok: false, pathLabel: 'F' });
    expect(JSON.stringify(get().browserTabFolders)).toBe(before);
  });

  it('returns { ok: false, pathLabel } on workspace url+title collision under a different tabId', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserWorkspaceBookmarks = {
      ws1: [
        { tabId: 'a', url: 'https://e.com', title: 'Title A' },
        { tabId: 'b', url: 'https://e.com', title: 'Title A' },
      ],
    };
    (get() as Record<string, unknown>).recentWorkspaces = [
      { id: 'ws1', name: 'WS1', path: '/ws1' },
    ];
    const before = JSON.stringify(get().browserWorkspaceBookmarks);
    const result = slice.browserUpdateSavedBookmark('a', {
      url: 'https://e.com',
      title: 'Title A',
    });
    expect(result).toEqual({ ok: false, pathLabel: 'WS1' });
    expect(JSON.stringify(get().browserWorkspaceBookmarks)).toBe(before);
  });

  it('returns { ok: true } no-op when tabId is not a saved bookmark', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    const result = slice.browserUpdateSavedBookmark('ghost', {
      url: 'https://x.com',
      title: 'X',
    });
    expect(result).toEqual({ ok: true });
  });

  it('updates browserBookmarkTabIdUrlMap[tabId] to the new url', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserTabFolders = [
      {
        id: 'f1',
        name: 'F',
        createdAt: 0,
        tabs: [{ tabId: 'a', url: 'https://old.com', title: 'Old' }],
      },
    ];
    (get() as Record<string, unknown>).browserBookmarkTabIdUrlMap = {
      a: 'https://old.com',
    };
    const result = slice.browserUpdateSavedBookmark('a', {
      url: 'https://new.com',
      title: 'New',
    });
    expect(result).toEqual({ ok: true });
    const state = get() as unknown as BrowserBookmarkSlice;
    expect(state.browserBookmarkTabIdUrlMap['a']).toBe('https://new.com');
  });

  it('title-only edit removes the old (url, oldTitle) tuple from browserBookmarks when unreferenced', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserTabFolders = [
      {
        id: 'f1',
        name: 'F',
        createdAt: 0,
        tabs: [{ tabId: 'a', url: 'https://e.com', title: 'Old Title' }],
      },
    ];
    (get() as Record<string, unknown>).browserBookmarks = [
      { url: 'https://e.com', title: 'Old Title' },
    ];
    const result = slice.browserUpdateSavedBookmark('a', {
      url: 'https://e.com',
      title: 'New Title',
    });
    expect(result).toEqual({ ok: true });
    const state = get() as unknown as BrowserBookmarkSlice;
    expect(state.browserBookmarks).toContainEqual({ url: 'https://e.com', title: 'New Title' });
    expect(state.browserBookmarks).not.toContainEqual({ url: 'https://e.com', title: 'Old Title' });
  });

  it('title-only edit keeps the old (url, oldTitle) tuple when another entry still references it', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserTabFolders = [
      {
        id: 'f1',
        name: 'F',
        createdAt: 0,
        tabs: [
          { tabId: 'a', url: 'https://e.com', title: 'Old Title' },
          { tabId: 'b', url: 'https://e.com', title: 'Old Title' },
        ],
      },
    ];
    (get() as Record<string, unknown>).browserBookmarks = [
      { url: 'https://e.com', title: 'Old Title' },
    ];
    const result = slice.browserUpdateSavedBookmark('a', {
      url: 'https://e.com',
      title: 'New Title',
    });
    expect(result).toEqual({ ok: true });
    const state = get() as unknown as BrowserBookmarkSlice;
    expect(state.browserBookmarks).toContainEqual({ url: 'https://e.com', title: 'New Title' });
    expect(state.browserBookmarks).toContainEqual({ url: 'https://e.com', title: 'Old Title' });
  });

  it('browserRemoveOrphanedBookmarks reclaims unreferenced (url,title) tuples, keeping same-url referenced titles', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserTabFolders = [
      {
        id: 'f1',
        name: 'F',
        createdAt: 0,
        tabs: [{ tabId: 'a', url: 'https://e.com', title: 'New Title' }],
      },
    ];
    (get() as Record<string, unknown>).browserWorkspaceBookmarks = {};
    (get() as Record<string, unknown>).browserBookmarks = [
      { url: 'https://e.com', title: 'New Title' },
      { url: 'https://e.com', title: 'Old Title' },
    ];
    slice.browserRemoveOrphanedBookmarks();
    const state = get() as unknown as BrowserBookmarkSlice;
    expect(state.browserBookmarks).toContainEqual({ url: 'https://e.com', title: 'New Title' });
    expect(state.browserBookmarks).not.toContainEqual({ url: 'https://e.com', title: 'Old Title' });
  });

  it('browserUpdateSavedBookmark returns {ok:false, pathLabel} on folder collision', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as any).browserTabFolders = [
      {
        id: 'f1',
        name: '工具',
        createdAt: 0,
        tabs: [
          { tabId: 'a', url: 'https://e.com', title: 'Title A' },
          { tabId: 'b', url: 'https://e.com', title: 'Title B' },
        ],
      },
    ];
    (get() as any).recentWorkspaces = [];
    const result = slice.browserUpdateSavedBookmark('a', {
      url: 'https://e.com',
      title: 'Title B',
    });
    expect(result).toEqual({ ok: false, pathLabel: '工具' });
    expect((get() as any).browserTabFolders[0].tabs[0].title).toBe('Title A');
  });

  it('browserUpdateSavedBookmark returns {ok:false, pathLabel} on workspace collision', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as any).browserWorkspaceBookmarks = {
      ws1: [
        { tabId: 'a', url: 'https://e.com', title: 'Title A' },
        { tabId: 'b', url: 'https://e.com', title: 'Title B' },
      ],
    };
    (get() as any).recentWorkspaces = [{ id: 'ws1', name: '工作区', path: '/ws1' }];
    const result = slice.browserUpdateSavedBookmark('a', {
      url: 'https://e.com',
      title: 'Title B',
    });
    expect(result).toEqual({ ok: false, pathLabel: '工作区' });
    expect((get() as any).browserWorkspaceBookmarks['ws1'][0].title).toBe('Title A');
  });

  it('browserUpdateSavedBookmark returns {ok:true} on normal update', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as any).browserTabFolders = [
      {
        id: 'f1',
        name: '工具',
        createdAt: 0,
        tabs: [{ tabId: 'a', url: 'https://e.com', title: 'Title A' }],
      },
    ];
    (get() as any).recentWorkspaces = [];
    const result = slice.browserUpdateSavedBookmark('a', {
      url: 'https://e.com',
      title: 'Title C',
    });
    expect(result).toEqual({ ok: true });
  });
});

describe('browserBookmarkTab title-update collision (path url+title)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks a title update that would create a same-url same-title duplicate in the folder', async () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserTabs = [
      { id: 'a', url: 'https://e.com', title: 'Title B' },
    ];
    (get() as Record<string, unknown>).browserTabFolders = [
      {
        id: 'f1',
        name: 'F',
        createdAt: 0,
        tabs: [
          { tabId: 'a', url: 'https://e.com', title: 'Title A' },
          { tabId: 'b', url: 'https://e.com', title: 'Title B' },
        ],
      },
    ];
    await slice.browserBookmarkTab('a', 'f1');
    const raw = get() as Record<string, unknown>;
    const folders = raw.browserTabFolders as {
      id: string;
      tabs?: { tabId: string; url: string; title: string }[];
    }[];
    const folder = folders.find((f) => f.id === 'f1')!;
    expect(folder.tabs).toHaveLength(2);
    expect(folder.tabs![0]).toMatchObject({ tabId: 'a', url: 'https://e.com', title: 'Title A' });
  });

  it('applies the title update when no same-url same-title collision exists in the folder', async () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserTabs = [
      { id: 'a', url: 'https://e.com', title: 'Title C' },
    ];
    (get() as Record<string, unknown>).browserTabFolders = [
      {
        id: 'f1',
        name: 'F',
        createdAt: 0,
        tabs: [
          { tabId: 'a', url: 'https://e.com', title: 'Title A' },
          { tabId: 'b', url: 'https://e.com', title: 'Title B' },
        ],
      },
    ];
    await slice.browserBookmarkTab('a', 'f1');
    const raw = get() as Record<string, unknown>;
    const folders = raw.browserTabFolders as {
      id: string;
      tabs?: { tabId: string; url: string; title: string }[];
    }[];
    const folder = folders.find((f) => f.id === 'f1')!;
    expect(folder.tabs).toHaveLength(2);
    expect(folder.tabs![0]).toMatchObject({ tabId: 'a', url: 'https://e.com', title: 'Title C' });
    expect(folder.tabs![1]).toMatchObject({ tabId: 'b', title: 'Title B' });
  });

  it('blocks a title update that would create a same-url same-title duplicate in a workspace', async () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserTabs = [
      { id: 'a', url: 'https://e.com', title: 'Title B' },
    ];
    (get() as Record<string, unknown>).browserTabFolders = [];
    (get() as Record<string, unknown>).browserWorkspaceBookmarks = {
      ws1: [
        { tabId: 'a', url: 'https://e.com', title: 'Title A' },
        { tabId: 'b', url: 'https://e.com', title: 'Title B' },
      ],
    };
    await slice.browserBookmarkTab('a', undefined, undefined, 'ws1');
    const state = get() as unknown as BrowserBookmarkSlice;
    const entries = state.browserWorkspaceBookmarks['ws1'];
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ tabId: 'a', url: 'https://e.com', title: 'Title A' });
  });
});
