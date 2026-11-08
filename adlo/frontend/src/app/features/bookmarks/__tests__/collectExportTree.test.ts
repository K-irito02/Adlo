import { describe, expect, it } from 'vitest';
import type { BookmarkEntry, BookmarkFolder } from '@stores/slices/browserSlice';
import type { RecentWorkspaceEntry } from '@shared/ipc';
import {
  buildBookmarkSelectionTree,
  buildExportNodes,
  collectLeafIds,
  selectionStateOf,
} from '../collectExportTree';

const entry = (id: string, url: string, title: string): BookmarkEntry => ({
  id,
  url,
  title,
  addedAt: 1_700_000_000_000,
  lastModifiedAt: 1_700_000_000_000,
});

const workspace = (id: string, name: string): RecentWorkspaceEntry =>
  ({ id, name, path: `/ws/${id}`, available: true, removedFromSidebar: false }) as never;

describe('buildBookmarkSelectionTree', () => {
  const folders: BookmarkFolder[] = [
    {
      id: 'f1',
      name: '工具',
      createdAt: 0,
      entries: [entry('b1', 'https://a.test/', 'A')],
      parentId: undefined,
    },
    {
      id: 'f2',
      name: '子目录',
      createdAt: 0,
      parentId: 'f1',
      parentType: 'folder',
      entries: [entry('b2', 'https://b.test/', 'B')],
    },
  ];

  it('counts bookmarks per root and per folder', () => {
    const tree = buildBookmarkSelectionTree({
      workspaces: [workspace('ws1', 'Adlo')],
      folders,
      workspaceBookmarks: { ws1: [entry('w1', 'https://w.test/', 'W')] },
    });
    expect(tree.workspaceRoot.children[0].bookmarkCount).toBe(1);
    expect(tree.folderRoot.bookmarkCount).toBe(2);
    expect(tree.folderRoot.children[0].bookmarkCount).toBe(2);
  });

  it('reports checked / partial / none', () => {
    const tree = buildBookmarkSelectionTree({
      workspaces: [workspace('ws1', 'Adlo')],
      folders,
      workspaceBookmarks: { ws1: [entry('w1', 'https://w.test/', 'W')] },
    });
    const root = tree.folderRoot.children[0];
    const leafIds = collectLeafIds(root);
    expect(selectionStateOf(root, new Set())).toBe('none');
    expect(selectionStateOf(root, new Set(leafIds))).toBe('checked');
    expect(selectionStateOf(root, new Set([leafIds[0]]))).toBe('partial');
  });

  it('keeps the ancestor chain when only a deep bookmark is selected', () => {
    const tree = buildBookmarkSelectionTree({
      workspaces: [workspace('ws1', 'Adlo')],
      folders,
      workspaceBookmarks: { ws1: [entry('w1', 'https://w.test/', 'W')] },
    });
    const nodes = buildExportNodes(tree.folderRoot, new Set(['entry:b2']));
    expect(nodes).toHaveLength(1);
    const root = nodes[0];
    if (root.kind !== 'folder') {
      throw new Error('expected folder');
    }
    expect(root.folder.name).toBe('工具');
    expect(root.folder.children[0]).toMatchObject({ kind: 'folder' });
  });

  it('drops folders whose descendants are not selected', () => {
    const tree = buildBookmarkSelectionTree({
      workspaces: [workspace('ws1', 'Adlo')],
      folders,
      workspaceBookmarks: { ws1: [entry('w1', 'https://w.test/', 'W')] },
    });
    const nodes = buildExportNodes(tree.workspaceRoot, new Set(['entry:w1']));
    expect(nodes[0]).toMatchObject({ kind: 'folder' });
    if (nodes[0].kind !== 'folder') {
      throw new Error('expected folder');
    }
    expect(nodes[0].folder.name).toBe('Adlo');
    expect(nodes[0].folder.children).toHaveLength(1);
  });
});
