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
  // 书签文件夹切片与书签切片合并后才构成完整状态；单测里补上该字段
  state = { browserBookmarkFolders: [], ...slice };
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
    raw0.browserBookmarkFolders = [{ id: folderId, name: 'F', createdAt: 0, entries: [] }];
    slice.browserCreateBookmarkEntry({
      url: 'https://example.com',
      title: 'Example',
      folderId,
    });
    const raw = get() as Record<string, unknown>;
    const folders = raw.browserBookmarkFolders as {
      id: string;
      name: string;
      createdAt: number;
      entries?: { id: string; url: string; title: string }[];
    }[];
    const folder = folders.find((f) => f.id === folderId)!;
    expect(folder.entries).toHaveLength(1);
    expect(folder.entries![0]).toMatchObject({ url: 'https://example.com', title: 'Example' });
    expect(folder.entries![0].id).toBeTruthy();
  });

  it('does not duplicate a folder entry on repeated folderId calls', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    const folderId = 'f1';
    const raw0 = get() as Record<string, unknown>;
    raw0.browserBookmarkFolders = [{ id: folderId, name: 'F', createdAt: 0, entries: [] }];
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
    const folders = raw.browserBookmarkFolders as {
      id: string;
      name: string;
      createdAt: number;
      entries?: { id: string; url: string; title: string }[];
    }[];
    const folder = folders.find((f) => f.id === folderId)!;
    expect(folder.entries).toHaveLength(1);
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
    (get() as Record<string, unknown>).browserBookmarkFolders = [
      {
        id: folderId,
        name: 'F',
        createdAt: 0,
        entries: [{ id: 'a', url: 'https://e.com', title: 'Title A' }],
      },
    ];
    slice.browserCreateBookmarkEntry({ url: 'https://e.com', title: 'Title B', folderId });
    const raw = get() as Record<string, unknown>;
    const folders = raw.browserBookmarkFolders as {
      id: string;
      name: string;
      createdAt: number;
      entries?: { id: string; url: string; title: string }[];
    }[];
    const folder = folders.find((f) => f.id === folderId)!;
    expect(folder.entries).toHaveLength(2);
    expect(folder.entries![1]).toMatchObject({ url: 'https://e.com', title: 'Title B' });
  });

  it('blocks same url + same title in the same folder', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    const folderId = 'f1';
    (get() as Record<string, unknown>).browserBookmarkFolders = [
      {
        id: folderId,
        name: 'F',
        createdAt: 0,
        entries: [{ id: 'a', url: 'https://e.com', title: 'Title A' }],
      },
    ];
    slice.browserCreateBookmarkEntry({ url: 'https://e.com', title: 'Title A', folderId });
    const raw = get() as Record<string, unknown>;
    const folders = raw.browserBookmarkFolders as {
      id: string;
      name: string;
      createdAt: number;
      entries?: { id: string; url: string; title: string }[];
    }[];
    const folder = folders.find((f) => f.id === folderId)!;
    expect(folder.entries).toHaveLength(1);
  });

  it('allows same url + same title in a different folder', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserBookmarkFolders = [
      {
        id: 'f1',
        name: 'F1',
        createdAt: 0,
        entries: [{ id: 'a', url: 'https://e.com', title: 'Title A' }],
      },
      { id: 'f2', name: 'F2', createdAt: 0, entries: [] },
    ];
    slice.browserCreateBookmarkEntry({ url: 'https://e.com', title: 'Title A', folderId: 'f2' });
    const raw = get() as Record<string, unknown>;
    const folders = raw.browserBookmarkFolders as {
      id: string;
      name: string;
      createdAt: number;
      entries?: { id: string; url: string; title: string }[];
    }[];
    const f1 = folders.find((f) => f.id === 'f1')!;
    const f2 = folders.find((f) => f.id === 'f2')!;
    expect(f1.entries).toHaveLength(1);
    expect(f2.entries).toHaveLength(1);
  });

  it('allows same url with different title in the same workspace', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserWorkspaceBookmarks = {
      ws1: [{ id: 'a', url: 'https://e.com', title: 'Title A' }],
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
      ws1: [{ id: 'a', url: 'https://e.com', title: 'Title A' }],
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
    (get() as any).browserBookmarkFolders = [
      {
        id: 'f1',
        name: '工具',
        createdAt: 0,
        entries: [{ id: 'a', url: 'https://e.com', title: 'Title A' }],
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

  it('updates url/title of a folder.entries entry', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    const folderId = 'f1';
    (get() as Record<string, unknown>).browserBookmarkFolders = [
      {
        id: folderId,
        name: 'F',
        createdAt: 0,
        entries: [{ id: 'a', url: 'https://old.com', title: 'Old' }],
      },
    ];
    const result = slice.browserUpdateSavedBookmark('a', {
      url: 'https://new.com',
      title: 'New',
    });
    expect(result).toEqual({ ok: true, isSavedBookmark: true });
    const raw = get() as Record<string, unknown>;
    const folders = raw.browserBookmarkFolders as {
      id: string;
      entries?: { id: string; url: string; title: string }[];
    }[];
    const folder = folders.find((f) => f.id === folderId)!;
    expect(folder.entries).toHaveLength(1);
    expect(folder.entries![0]).toMatchObject({ id: 'a', url: 'https://new.com', title: 'New' });
  });

  it('updates url/title of a workspaceBookmarks entry', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserWorkspaceBookmarks = {
      ws1: [{ id: 'a', url: 'https://old.com', title: 'Old' }],
    };
    const result = slice.browserUpdateSavedBookmark('a', {
      url: 'https://new.com',
      title: 'New',
    });
    expect(result).toEqual({ ok: true, isSavedBookmark: true });
    const state = get() as unknown as BrowserBookmarkSlice;
    expect(state.browserWorkspaceBookmarks['ws1'][0]).toMatchObject({
      id: 'a',
      url: 'https://new.com',
      title: 'New',
    });
  });

  it('syncs browserBookmarks after updating a folder entry', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserBookmarkFolders = [
      {
        id: 'f1',
        name: 'F',
        createdAt: 0,
        entries: [{ id: 'a', url: 'https://old.com', title: 'Old' }],
      },
    ];
    (get() as Record<string, unknown>).browserBookmarks = [
      { url: 'https://old.com', title: 'Old' },
    ];
    const result = slice.browserUpdateSavedBookmark('a', {
      url: 'https://new.com',
      title: 'New',
    });
    expect(result).toEqual({ ok: true, isSavedBookmark: true });
    const state = get() as unknown as BrowserBookmarkSlice;
    expect(state.browserBookmarks).toContainEqual({ url: 'https://new.com', title: 'New' });
    expect(state.browserBookmarks.find((b) => b.url === 'https://old.com')).toBeUndefined();
  });

  it('returns { ok: false, pathLabel } and leaves state unchanged on same-path url+title collision', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserBookmarkFolders = [
      {
        id: 'f1',
        name: 'F',
        createdAt: 0,
        entries: [
          { id: 'a', sourceTabId: 'a', url: 'https://e.com', title: 'Title A' },
          { id: 'b', url: 'https://e.com', title: 'Title A' },
        ],
      },
    ];
    (get() as Record<string, unknown>).recentWorkspaces = [];
    const before = JSON.stringify(get().browserBookmarkFolders);
    const result = slice.browserUpdateSavedBookmark('a', {
      url: 'https://e.com',
      title: 'Title A',
    });
    expect(result).toEqual({ ok: false, pathLabel: 'F', isSavedBookmark: true });
    expect(JSON.stringify(get().browserBookmarkFolders)).toBe(before);
  });

  it('returns { ok: false, pathLabel } on workspace url+title collision under a different tabId', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserWorkspaceBookmarks = {
      ws1: [
        { id: 'a', url: 'https://e.com', title: 'Title A' },
        { id: 'b', url: 'https://e.com', title: 'Title A' },
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
    expect(result).toEqual({ ok: false, pathLabel: 'WS1', isSavedBookmark: true });
    expect(JSON.stringify(get().browserWorkspaceBookmarks)).toBe(before);
  });

  it('returns { ok: true } no-op when tabId is not a saved bookmark', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    const result = slice.browserUpdateSavedBookmark('ghost', {
      url: 'https://x.com',
      title: 'X',
    });
    expect(result).toEqual({ ok: true, isSavedBookmark: false });
  });

  it('bumps lastModifiedAt when the bookmark url/title is edited', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserBookmarkFolders = [
      {
        id: 'f1',
        name: 'F',
        createdAt: 0,
        entries: [
          {
            id: 'a',
            url: 'https://old.com',
            title: 'Old',
            addedAt: 0,
            lastModifiedAt: 0,
          },
        ],
      },
    ];
    const result = slice.browserUpdateSavedBookmark('a', {
      url: 'https://new.com',
      title: 'New',
    });
    expect(result).toEqual({ ok: true, isSavedBookmark: true });
    const raw = get() as Record<string, unknown>;
    const folder = (
      raw.browserBookmarkFolders as {
        entries?: { id: string; url: string; addedAt: number; lastModifiedAt: number }[];
      }[]
    )[0];
    const entry = folder.entries![0];
    expect(entry.url).toBe('https://new.com');
    expect(entry.addedAt).toBe(0);
    expect(entry.lastModifiedAt).toBeGreaterThan(0);
  });

  it('title-only edit removes the old (url, oldTitle) tuple from browserBookmarks when unreferenced', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserBookmarkFolders = [
      {
        id: 'f1',
        name: 'F',
        createdAt: 0,
        entries: [{ id: 'a', url: 'https://e.com', title: 'Old Title' }],
      },
    ];
    (get() as Record<string, unknown>).browserBookmarks = [
      { url: 'https://e.com', title: 'Old Title' },
    ];
    const result = slice.browserUpdateSavedBookmark('a', {
      url: 'https://e.com',
      title: 'New Title',
    });
    expect(result).toEqual({ ok: true, isSavedBookmark: true });
    const state = get() as unknown as BrowserBookmarkSlice;
    expect(state.browserBookmarks).toContainEqual({ url: 'https://e.com', title: 'New Title' });
    expect(state.browserBookmarks).not.toContainEqual({ url: 'https://e.com', title: 'Old Title' });
  });

  it('title-only edit keeps the old (url, oldTitle) tuple when another entry still references it', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserBookmarkFolders = [
      {
        id: 'f1',
        name: 'F',
        createdAt: 0,
        entries: [
          { id: 'a', url: 'https://e.com', title: 'Old Title' },
          { id: 'b', url: 'https://e.com', title: 'Old Title' },
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
    expect(result).toEqual({ ok: true, isSavedBookmark: true });
    const state = get() as unknown as BrowserBookmarkSlice;
    expect(state.browserBookmarks).toContainEqual({ url: 'https://e.com', title: 'New Title' });
    expect(state.browserBookmarks).toContainEqual({ url: 'https://e.com', title: 'Old Title' });
  });

  it('browserRemoveOrphanedBookmarks reclaims unreferenced (url,title) tuples, keeping same-url referenced titles', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserBookmarkFolders = [
      {
        id: 'f1',
        name: 'F',
        createdAt: 0,
        entries: [{ id: 'a', url: 'https://e.com', title: 'New Title' }],
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
    (get() as any).browserBookmarkFolders = [
      {
        id: 'f1',
        name: '工具',
        createdAt: 0,
        entries: [
          { id: 'a', sourceTabId: 'a', url: 'https://e.com', title: 'Title A' },
          { id: 'b', url: 'https://e.com', title: 'Title B' },
        ],
      },
    ];
    (get() as any).recentWorkspaces = [];
    const result = slice.browserUpdateSavedBookmark('a', {
      url: 'https://e.com',
      title: 'Title B',
    });
    expect(result).toEqual({ ok: false, pathLabel: '工具', isSavedBookmark: true });
    expect((get() as any).browserBookmarkFolders[0].entries[0].title).toBe('Title A');
  });

  it('browserUpdateSavedBookmark returns {ok:false, pathLabel} on workspace collision', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as any).browserWorkspaceBookmarks = {
      ws1: [
        { id: 'a', url: 'https://e.com', title: 'Title A' },
        { id: 'b', url: 'https://e.com', title: 'Title B' },
      ],
    };
    (get() as any).recentWorkspaces = [{ id: 'ws1', name: '工作区', path: '/ws1' }];
    const result = slice.browserUpdateSavedBookmark('a', {
      url: 'https://e.com',
      title: 'Title B',
    });
    expect(result).toEqual({ ok: false, pathLabel: '工作区', isSavedBookmark: true });
    expect((get() as any).browserWorkspaceBookmarks['ws1'][0].title).toBe('Title A');
  });

  it('browserUpdateSavedBookmark returns {ok:true} on normal update', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as any).browserBookmarkFolders = [
      {
        id: 'f1',
        name: '工具',
        createdAt: 0,
        entries: [{ id: 'a', url: 'https://e.com', title: 'Title A' }],
      },
    ];
    (get() as any).recentWorkspaces = [];
    const result = slice.browserUpdateSavedBookmark('a', {
      url: 'https://e.com',
      title: 'Title C',
    });
    expect(result).toEqual({ ok: true, isSavedBookmark: true });
  });
});

describe('browserSaveTabAsBookmark title-update collision (path url+title)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks a title update that would create a same-url same-title duplicate in the folder', async () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserTabs = [
      { id: 'a', url: 'https://e.com', title: 'Title B' },
    ];
    (get() as Record<string, unknown>).browserBookmarkFolders = [
      {
        id: 'f1',
        name: 'F',
        createdAt: 0,
        entries: [
          { id: 'a', sourceTabId: 'a', url: 'https://e.com', title: 'Title A' },
          { id: 'b', url: 'https://e.com', title: 'Title B' },
        ],
      },
    ];
    await slice.browserSaveTabAsBookmark('a', 'f1');
    const raw = get() as Record<string, unknown>;
    const folders = raw.browserBookmarkFolders as {
      id: string;
      entries?: { id: string; url: string; title: string }[];
    }[];
    const folder = folders.find((f) => f.id === 'f1')!;
    expect(folder.entries).toHaveLength(2);
    expect(folder.entries![0]).toMatchObject({ id: 'a', url: 'https://e.com', title: 'Title A' });
  });

  it('applies the title update when no same-url same-title collision exists in the folder', async () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserTabs = [
      { id: 'a', url: 'https://e.com', title: 'Title C' },
    ];
    (get() as Record<string, unknown>).browserBookmarkFolders = [
      {
        id: 'f1',
        name: 'F',
        createdAt: 0,
        entries: [
          { id: 'a', sourceTabId: 'a', url: 'https://e.com', title: 'Title A' },
          { id: 'b', url: 'https://e.com', title: 'Title B' },
        ],
      },
    ];
    await slice.browserSaveTabAsBookmark('a', 'f1');
    const raw = get() as Record<string, unknown>;
    const folders = raw.browserBookmarkFolders as {
      id: string;
      entries?: { id: string; url: string; title: string }[];
    }[];
    const folder = folders.find((f) => f.id === 'f1')!;
    expect(folder.entries).toHaveLength(2);
    expect(folder.entries![0]).toMatchObject({ id: 'a', url: 'https://e.com', title: 'Title C' });
    expect(folder.entries![1]).toMatchObject({ id: 'b', title: 'Title B' });
  });

  it('blocks a title update that would create a same-url same-title duplicate in a workspace', async () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as Record<string, unknown>).browserTabs = [
      { id: 'a', url: 'https://e.com', title: 'Title B' },
    ];
    (get() as Record<string, unknown>).browserBookmarkFolders = [];
    (get() as Record<string, unknown>).browserWorkspaceBookmarks = {
      ws1: [
        { id: 'a', url: 'https://e.com', title: 'Title A' },
        { id: 'b', url: 'https://e.com', title: 'Title B' },
      ],
    };
    await slice.browserSaveTabAsBookmark('a', undefined, undefined, 'ws1');
    const state = get() as unknown as BrowserBookmarkSlice;
    const entries = state.browserWorkspaceBookmarks['ws1'];
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ id: 'a', url: 'https://e.com', title: 'Title A' });
  });
});

describe('browserSaveTabAsBookmark returns ok+pathLabel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('browserSaveTabAsBookmark returns {ok:false, pathLabel} on folder dedup under a different tabId', async () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as any).browserBookmarkFolders = [
      {
        id: 'f1',
        name: '工具',
        createdAt: 0,
        entries: [{ id: 'a', url: 'https://e.com', title: 'Title A' }],
      },
    ];
    (get() as any).recentWorkspaces = [];
    (get() as any).browserTabs = [
      { id: 't1', workspaceId: 'w', title: 'Title A', url: 'https://e.com' },
    ];
    const result = await slice.browserSaveTabAsBookmark('t1', 'f1');
    expect(result).toEqual({ ok: false, pathLabel: '工具' });
    expect((get() as any).browserBookmarkFolders[0].entries).toHaveLength(1);
  });

  it('browserSaveTabAsBookmark returns {ok:true} and performs the save on normal bookmark', async () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as any).browserBookmarkFolders = [{ id: 'f1', name: '工具', createdAt: 0, entries: [] }];
    (get() as any).recentWorkspaces = [];
    (get() as any).browserTabs = [
      { id: 't1', workspaceId: 'w', title: 'Title A', url: 'https://e.com' },
    ];
    const result = await slice.browserSaveTabAsBookmark('t1', 'f1');
    expect(result).toEqual({ ok: true });
    expect((get() as any).browserBookmarkFolders[0].entries).toHaveLength(1);
  });

  it('browserSaveTabAsBookmark does NOT block re-saving the same tabId (update path)', async () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as any).browserBookmarkFolders = [
      {
        id: 'f1',
        name: '工具',
        createdAt: 0,
        entries: [{ id: 't1', sourceTabId: 't1', url: 'https://e.com', title: 'Title A' }],
      },
    ];
    (get() as any).recentWorkspaces = [];
    (get() as any).browserTabs = [
      { id: 't1', workspaceId: 'w', title: 'Title A', url: 'https://e.com' },
    ];
    const result = await slice.browserSaveTabAsBookmark('t1', 'f1');
    expect(result).toEqual({ ok: true });
  });

  it('browserSaveTabAsBookmark returns {ok:false, pathLabel} on workspace dedup under a different tabId', async () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as any).browserBookmarkFolders = [];
    (get() as any).browserWorkspaceBookmarks = {
      ws1: [{ id: 'a', url: 'https://e.com', title: 'Title A' }],
    };
    (get() as any).recentWorkspaces = [{ id: 'ws1', name: '工作区', path: '/ws1' }];
    (get() as any).browserTabs = [
      { id: 't1', workspaceId: 'ws1', title: 'Title A', url: 'https://e.com' },
    ];
    const result = await slice.browserSaveTabAsBookmark('t1', undefined, undefined, 'ws1');
    expect(result).toEqual({ ok: false, pathLabel: '工作区' });
  });
});

describe('browserSaveTabAsBookmark titleOverride', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes the titleOverride title into the folder entry (not hostname)', async () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as any).browserBookmarkFolders = [{ id: 'f1', name: '工具', createdAt: 0, entries: [] }];
    (get() as any).recentWorkspaces = [];
    (get() as any).browserTabs = [{ id: 't1', workspaceId: 'w', title: '', url: 'https://e.com' }];
    const result = await slice.browserSaveTabAsBookmark(
      't1',
      'f1',
      undefined,
      undefined,
      '自定义标题',
    );
    expect(result).toEqual({ ok: true });
    expect((get() as any).browserBookmarkFolders[0].entries).toHaveLength(1);
    expect((get() as any).browserBookmarkFolders[0].entries[0]).toMatchObject({
      url: 'https://e.com',
      title: '自定义标题',
    });
  });

  it('writes the titleOverride title into the workspace entry', async () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as any).browserBookmarkFolders = [];
    (get() as any).browserWorkspaceBookmarks = {};
    (get() as any).recentWorkspaces = [{ id: 'ws1', name: '工作区', path: '/ws1' }];
    (get() as any).browserTabs = [
      { id: 't1', workspaceId: 'ws1', title: '', url: 'https://e.com' },
    ];
    const result = await slice.browserSaveTabAsBookmark(
      't1',
      undefined,
      undefined,
      'ws1',
      '自定义标题',
    );
    expect(result).toEqual({ ok: true });
    expect((get() as any).browserWorkspaceBookmarks['ws1']).toHaveLength(1);
    expect((get() as any).browserWorkspaceBookmarks['ws1'][0]).toMatchObject({
      url: 'https://e.com',
      title: '自定义标题',
    });
  });

  it('uses titleOverride in the collision precheck (blocks same url+title under a different tabId)', async () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as any).browserBookmarkFolders = [
      {
        id: 'f1',
        name: '工具',
        createdAt: 0,
        entries: [{ id: 'a', url: 'https://e.com', title: '自定义标题' }],
      },
    ];
    (get() as any).recentWorkspaces = [];
    (get() as any).browserTabs = [{ id: 't1', workspaceId: 'w', title: '', url: 'https://e.com' }];
    const result = await slice.browserSaveTabAsBookmark(
      't1',
      'f1',
      undefined,
      undefined,
      '自定义标题',
    );
    expect(result).toEqual({ ok: false, pathLabel: '工具' });
    expect((get() as any).browserBookmarkFolders[0].entries).toHaveLength(1);
  });
});

describe('browserRemoveBookmark tuple-keyed global cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes only the (url,title) tuple no longer referenced, keeping same-url other-title global entries', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as any).browserBookmarkFolders = [
      {
        id: 'f1',
        name: 'F',
        createdAt: 0,
        entries: [{ id: 'a', url: 'https://e.com', title: 'Title A' }],
      },
    ];
    (get() as any).browserBookmarks = [
      { url: 'https://e.com', title: 'Title A' },
      { url: 'https://e.com', title: 'Title B' },
    ];
    slice.browserRemoveBookmark('a', 'https://e.com');
    const state = get() as unknown as BrowserBookmarkSlice;
    expect(state.browserBookmarks).not.toContainEqual({ url: 'https://e.com', title: 'Title A' });
    expect(state.browserBookmarks).toContainEqual({ url: 'https://e.com', title: 'Title B' });
  });

  it('keeps the global (url,title) tuple when another folder entry still references it', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as any).browserBookmarkFolders = [
      {
        id: 'f1',
        name: 'F',
        createdAt: 0,
        entries: [
          { id: 'a', sourceTabId: 'a', url: 'https://e.com', title: 'Title A' },
          { id: 'b', url: 'https://e.com', title: 'Title A' },
        ],
      },
    ];
    (get() as any).browserBookmarks = [{ url: 'https://e.com', title: 'Title A' }];
    slice.browserRemoveBookmark('a', 'https://e.com');
    const state = get() as unknown as BrowserBookmarkSlice;
    expect(state.browserBookmarks).toContainEqual({ url: 'https://e.com', title: 'Title A' });
  });
});

describe('browserSaveTabAsBookmark in-place stale entry removal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes the same tabId old-URL folder entry when re-bookmarking after in-place navigation', async () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as any).browserBookmarkFolders = [
      {
        id: 'f1',
        name: 'F',
        createdAt: 0,
        entries: [{ id: 't1', sourceTabId: 't1', url: 'https://old.com', title: 'Old' }],
      },
    ];
    (get() as any).recentWorkspaces = [];
    (get() as any).browserTabs = [
      { id: 't1', workspaceId: 'w', title: 'New', url: 'https://new.com' },
    ];
    const result = await slice.browserSaveTabAsBookmark('t1', 'f1');
    expect(result).toEqual({ ok: true });
    const folder = (get() as any).browserBookmarkFolders[0];
    expect(folder.entries).toHaveLength(1);
    expect(folder.entries[0]).toMatchObject({ id: 't1', url: 'https://new.com' });
  });
});
describe('browserToggleBookmark tuple semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds the specific (url,title) tuple on star-on', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as any).browserBookmarkFolders = [];
    (get() as any).browserWorkspaceBookmarks = {};
    (get() as any).browserTabs = [
      { id: 't1', workspaceId: 'w', title: 'Title A', url: 'https://e.com' },
    ];
    (get() as any).browserActiveTabId = 't1';
    slice.browserToggleBookmark();
    const state = get() as unknown as BrowserBookmarkSlice;
    expect(state.browserBookmarks).toContainEqual({ url: 'https://e.com', title: 'Title A' });
  });

  it('removes only the matching (url,title) tuple on star-off, keeping other-title tuples', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as any).browserBookmarkFolders = [];
    (get() as any).browserWorkspaceBookmarks = {};
    (get() as any).browserTabs = [
      { id: 't1', workspaceId: 'w', title: 'Title A', url: 'https://e.com' },
    ];
    (get() as any).browserActiveTabId = 't1';
    (get() as any).browserBookmarks = [
      { url: 'https://e.com', title: 'Title A' },
      { url: 'https://e.com', title: 'Title B' },
    ];
    slice.browserToggleBookmark();
    const state = get() as unknown as BrowserBookmarkSlice;
    expect(state.browserBookmarks).not.toContainEqual({ url: 'https://e.com', title: 'Title A' });
    expect(state.browserBookmarks).toContainEqual({ url: 'https://e.com', title: 'Title B' });
  });

  it('keeps the global tuple on star-off when a folder entry still references it', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as any).browserBookmarkFolders = [
      {
        id: 'f1',
        name: 'F',
        createdAt: 0,
        entries: [{ id: 'synth', url: 'https://e.com', title: 'Title A' }],
      },
    ];
    (get() as any).browserTabs = [
      { id: 't1', workspaceId: 'w', title: 'Title A', url: 'https://e.com' },
    ];
    (get() as any).browserActiveTabId = 't1';
    (get() as any).browserBookmarks = [{ url: 'https://e.com', title: 'Title A' }];
    slice.browserToggleBookmark();
    const state = get() as unknown as BrowserBookmarkSlice;
    expect(state.browserBookmarks).toContainEqual({ url: 'https://e.com', title: 'Title A' });
  });

  it('removes only the matching title entries for the tab, keeping other-title entries in other folders', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    (get() as any).browserBookmarkFolders = [
      {
        id: 'f1',
        name: 'F1',
        createdAt: 0,
        entries: [{ id: 't1', sourceTabId: 't1', url: 'https://e.com', title: 'Custom A' }],
      },
      {
        id: 'f2',
        name: 'F2',
        createdAt: 0,
        entries: [{ id: 't1', sourceTabId: 't1', url: 'https://e.com', title: 'Custom A2' }],
      },
    ];
    (get() as any).browserTabs = [
      { id: 't1', workspaceId: 'w', title: 'Custom A', url: 'https://e.com' },
    ];
    (get() as any).browserActiveTabId = 't1';
    (get() as any).browserBookmarks = [
      { url: 'https://e.com', title: 'Custom A' },
      { url: 'https://e.com', title: 'Custom A2' },
    ];
    slice.browserToggleBookmark();
    const state = get() as unknown as BrowserBookmarkSlice;
    const folders = (get() as any).browserBookmarkFolders;
    expect(folders[0].entries).toHaveLength(0);
    expect(folders[1].entries).toHaveLength(1);
    expect(folders[1].entries[0].title).toBe('Custom A2');
    expect(state.browserBookmarks).not.toContainEqual({ url: 'https://e.com', title: 'Custom A' });
    expect(state.browserBookmarks).toContainEqual({ url: 'https://e.com', title: 'Custom A2' });
  });
});
