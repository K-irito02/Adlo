import { describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createBrowserBookmarkSlice } from '../browserBookmarkSlice';
import { createBookmarkTransferSlice } from '../bookmarkTransferSlice';
import type { TransferNode } from '@features/bookmarks/bookmarkTransferTypes';

const bookmark = (url: string, title: string): TransferNode => ({
  kind: 'bookmark',
  url,
  title,
  addedAt: 1_700_000_000_000,
  lastModifiedAt: 1_700_000_000_000,
});

const folder = (name: string, children: TransferNode[]): TransferNode => ({
  kind: 'folder',
  folder: { name, children },
});

function makeStore() {
  const store = createStore<any>((set, get) => ({
    ...createBrowserBookmarkSlice(set, get),
    ...createBookmarkTransferSlice(set, get),
    browserBookmarkFolders: [],
    browserWorkspaceBookmarks: {},
    browserBookmarks: [],
  }));
  return store;
}

describe('browserImportBookmarks', () => {
  it('creates a new folder with nested subfolders and entries', () => {
    const store = makeStore();
    const result = store.getState().browserImportBookmarks({
      nodes: [
        bookmark('https://a.test/', 'A'),
        folder('子目录', [bookmark('https://b.test/', 'B')]),
      ],
      target: { kind: 'new-folder', name: '导入的书签' },
      duplicatePolicy: 'skip',
    });

    expect(result).toEqual({ importedBookmarks: 2, importedFolders: 2, skipped: 0 });
    const folders = store.getState().browserBookmarkFolders;
    const root = folders.find((f: any) => f.name === '导入的书签')!;
    expect(root.entries).toHaveLength(1);
    const child = folders.find((f: any) => f.parentId === root.id)!;
    expect(child.parentType).toBe('folder');
    expect(child.entries).toHaveLength(1);
    expect(store.getState().browserBookmarks).toEqual(
      expect.arrayContaining([
        { url: 'https://a.test/', title: 'A' },
        { url: 'https://b.test/', title: 'B' },
      ]),
    );
  });

  it('skips duplicates inside an existing folder and can allow them', () => {
    const store = makeStore();
    store.setState({
      browserBookmarkFolders: [
        {
          id: 'f1',
          name: '工具',
          createdAt: 0,
          entries: [{ id: 'x', url: 'https://a.test/', title: 'A', addedAt: 0, lastModifiedAt: 0 }],
        },
      ],
    });

    const skipped = store.getState().browserImportBookmarks({
      nodes: [bookmark('https://a.test/', 'A'), bookmark('https://b.test/', 'B')],
      target: { kind: 'folder', id: 'f1' },
      duplicatePolicy: 'skip',
    });
    expect(skipped).toEqual({ importedBookmarks: 1, importedFolders: 0, skipped: 1 });

    const allowed = store.getState().browserImportBookmarks({
      nodes: [bookmark('https://a.test/', 'A')],
      target: { kind: 'folder', id: 'f1' },
      duplicatePolicy: 'allow',
    });
    expect(allowed.importedBookmarks).toBe(1);
    expect(store.getState().browserBookmarkFolders[0].entries).toHaveLength(3);
  });

  it('imports into a workspace directory', () => {
    const store = makeStore();
    const result = store.getState().browserImportBookmarks({
      nodes: [bookmark('https://w.test/', 'W'), folder('分组', [bookmark('https://x.test/', 'X')])],
      target: { kind: 'workspace', id: 'ws1' },
      duplicatePolicy: 'skip',
    });

    expect(result.importedBookmarks).toBe(2);
    expect(store.getState().browserWorkspaceBookmarks['ws1']).toHaveLength(1);
    const nested = store.getState().browserBookmarkFolders[0];
    expect(nested.parentType).toBe('workspace');
    expect(nested.parentId).toBe('ws1');
  });

  it('carries the icon uri from the file into the created entry', () => {
    const store = makeStore();
    store.getState().browserImportBookmarks({
      nodes: [{ ...bookmark('https://a.test/', 'A'), icon: 'data:image/png;base64,AAA' }],
      target: { kind: 'new-folder', name: 'F' },
      duplicatePolicy: 'skip',
    });
    const entry = store.getState().browserBookmarkFolders[0].entries[0];
    expect(entry.iconUri).toBe('data:image/png;base64,AAA');
  });
});
