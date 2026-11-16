import { describe, expect, it } from 'vitest';
import {
  applyBookmarkMove,
  CUSTOM_ROOT,
  entryItemKey,
  folderContainerKey,
  folderItemKey,
  resolveContainerChildren,
  workspaceContainerKey,
} from '../browserBookmarkOrder';
import type { BookmarkMoveState } from '../browserBookmarkOrder';
import type { BookmarkEntry, BookmarkFolder } from '../browserTypes';

function entry(id: string, title = id): BookmarkEntry {
  return {
    id,
    url: `https://example.com/${id}`,
    title,
    addedAt: 1,
    lastModifiedAt: 1,
  };
}

function makeState(): BookmarkMoveState {
  const folders: BookmarkFolder[] = [
    { id: 'f-a', name: 'A', createdAt: 0, entries: [entry('e1'), entry('e2')] },
    {
      id: 'f-b',
      name: 'B',
      createdAt: 0,
      parentId: 'f-a',
      parentType: 'folder',
      entries: [entry('e3')],
    },
    {
      id: 'f-ws',
      name: 'Workspace folder',
      createdAt: 0,
      parentId: 'ws-1',
      parentType: 'workspace',
      entries: [],
    },
  ];
  return {
    browserBookmarkFolders: folders,
    browserWorkspaceBookmarks: { 'ws-1': [entry('w1')] },
    browserBookmarkChildOrder: {},
    workspaceIds: ['ws-1'],
  };
}

describe('resolveContainerChildren', () => {
  it('defaults to folders before bookmarks', () => {
    const state = makeState();
    const children = resolveContainerChildren(state, folderContainerKey('f-a'));
    expect(children.map((child) => child.key)).toEqual([
      folderItemKey('f-b'),
      entryItemKey('e1'),
      entryItemKey('e2'),
    ]);
    expect(
      resolveContainerChildren(state, workspaceContainerKey('ws-1')).map((c) => c.key),
    ).toEqual([folderItemKey('f-ws'), entryItemKey('w1')]);
  });

  it('follows the order table and ignores unknown keys', () => {
    const state = makeState();
    state.browserBookmarkChildOrder[folderContainerKey('f-a')] = [
      entryItemKey('e2'),
      'entry:missing',
      folderItemKey('f-b'),
    ];
    expect(resolveContainerChildren(state, folderContainerKey('f-a')).map((c) => c.key)).toEqual([
      entryItemKey('e2'),
      folderItemKey('f-b'),
      entryItemKey('e1'),
    ]);
  });
});

describe('applyBookmarkMove', () => {
  it('moves a bookmark into another folder and normalizes both orders', () => {
    const state = makeState();
    const result = applyBookmarkMove(state, {
      kind: 'bookmark',
      id: 'e1',
      target: { kind: 'into', container: folderContainerKey('f-b') },
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    const target = resolveContainerChildren(result.state, folderContainerKey('f-b'));
    expect(target.map((c) => c.key)).toEqual([entryItemKey('e3'), entryItemKey('e1')]);
    const source = resolveContainerChildren(result.state, folderContainerKey('f-a'));
    expect(source.map((c) => c.key)).toEqual([folderItemKey('f-b'), entryItemKey('e2')]);
  });

  it('moves a folder into a workspace and updates parentType', () => {
    const state = makeState();
    const result = applyBookmarkMove(state, {
      kind: 'folder',
      id: 'f-b',
      target: { kind: 'into', container: workspaceContainerKey('ws-1') },
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    const folder = result.state.browserBookmarkFolders.find((item) => item.id === 'f-b');
    expect(folder?.parentId).toBe('ws-1');
    expect(folder?.parentType).toBe('workspace');
    expect(
      resolveContainerChildren(result.state, workspaceContainerKey('ws-1')).map((c) => c.key),
    ).toEqual([folderItemKey('f-ws'), entryItemKey('w1'), folderItemKey('f-b')]);
  });

  it('turns a folder into a new custom root', () => {
    const state = makeState();
    const result = applyBookmarkMove(state, {
      kind: 'folder',
      id: 'f-ws',
      target: { kind: 'new-root' },
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    const folder = result.state.browserBookmarkFolders.find((item) => item.id === 'f-ws');
    expect(folder?.parentId).toBeUndefined();
    expect(folder?.parentType).toBeUndefined();
    expect(resolveContainerChildren(result.state, CUSTOM_ROOT).map((c) => c.key)).toEqual([
      folderItemKey('f-a'),
      folderItemKey('f-ws'),
    ]);
  });

  it('rejects moving a folder into its own descendant', () => {
    const state = makeState();
    const result = applyBookmarkMove(state, {
      kind: 'folder',
      id: 'f-a',
      target: { kind: 'into', container: folderContainerKey('f-b') },
    });
    expect(result).toEqual({ ok: false, error: 'folder-into-descendant' });
  });

  it('rejects a bookmark duplicate in the target container', () => {
    const state = makeState();
    const source = state.browserBookmarkFolders.find((folder) => folder.id === 'f-a');
    const duplicate = {
      ...entry('e4'),
      url: source!.entries![0].url,
      title: source!.entries![0].title,
    };
    state.browserBookmarkFolders = state.browserBookmarkFolders.map((folder) =>
      folder.id === 'f-b' ? { ...folder, entries: [...(folder.entries ?? []), duplicate] } : folder,
    );
    const result = applyBookmarkMove(state, {
      kind: 'bookmark',
      id: 'e1',
      target: { kind: 'into', container: folderContainerKey('f-b') },
    });
    expect(result).toEqual({ ok: false, error: 'bookmark-duplicate' });
  });

  it('rejects moving a bookmark to the custom root', () => {
    const state = makeState();
    const result = applyBookmarkMove(state, {
      kind: 'bookmark',
      id: 'e1',
      target: { kind: 'into', container: CUSTOM_ROOT },
    });
    expect(result).toEqual({ ok: false, error: 'bookmark-to-custom-root' });
  });

  it('rejects a folder target that no longer exists', () => {
    const state = makeState();
    expect(
      applyBookmarkMove(state, {
        kind: 'folder',
        id: 'f-b',
        target: { kind: 'into', container: folderContainerKey('folder-ghost') },
      }),
    ).toEqual({ ok: false, error: 'target-missing' });
  });

  it('rejects a bookmark target that no longer exists without dropping the entry', () => {
    const state = makeState();
    const result = applyBookmarkMove(state, {
      kind: 'bookmark',
      id: 'e1',
      target: { kind: 'into', container: folderContainerKey('folder-ghost') },
    });
    expect(result).toEqual({ ok: false, error: 'target-missing' });
    expect(state.browserBookmarkFolders.find((folder) => folder.id === 'f-a')?.entries).toEqual([
      entry('e1'),
      entry('e2'),
    ]);
  });

  it('rejects an unknown workspace when workspaceIds is provided', () => {
    const state = makeState();
    expect(
      applyBookmarkMove(state, {
        kind: 'folder',
        id: 'f-b',
        target: { kind: 'into', container: workspaceContainerKey('ws-ghost') },
      }),
    ).toEqual({ ok: false, error: 'target-missing' });
    expect(
      applyBookmarkMove(state, {
        kind: 'bookmark',
        id: 'e1',
        target: { kind: 'into', container: workspaceContainerKey('ws-ghost') },
      }),
    ).toEqual({ ok: false, error: 'target-missing' });
  });

  it('allows a known but empty workspace target', () => {
    const state = makeState();
    state.workspaceIds = ['ws-1', 'ws-empty'];
    const result = applyBookmarkMove(state, {
      kind: 'bookmark',
      id: 'e1',
      target: { kind: 'into', container: workspaceContainerKey('ws-empty') },
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.state.browserWorkspaceBookmarks['ws-empty']?.map((item) => item.id)).toEqual([
      'e1',
    ]);
  });

  it('treats omitted workspaceIds as lenient and an empty list as strict', () => {
    const lenient = makeState();
    lenient.workspaceIds = undefined;
    expect(
      applyBookmarkMove(lenient, {
        kind: 'bookmark',
        id: 'e1',
        target: { kind: 'into', container: workspaceContainerKey('ws-ghost') },
      }).ok,
    ).toBe(true);

    const strict = makeState();
    strict.workspaceIds = [];
    expect(
      applyBookmarkMove(strict, {
        kind: 'bookmark',
        id: 'e1',
        target: { kind: 'into', container: workspaceContainerKey('ws-ghost') },
      }),
    ).toEqual({ ok: false, error: 'target-missing' });
  });

  it('carries workspaceIds into the returned state for chained moves', () => {
    const state = makeState();
    const result = applyBookmarkMove(state, {
      kind: 'bookmark',
      id: 'e1',
      target: { kind: 'into', container: folderContainerKey('f-b') },
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.state.workspaceIds).toEqual(state.workspaceIds);
  });

  it('reorders within the same container with index adjustment', () => {
    const state = makeState();
    state.browserBookmarkChildOrder[folderContainerKey('f-a')] = [
      folderItemKey('f-b'),
      entryItemKey('e1'),
      entryItemKey('e2'),
    ];
    const result = applyBookmarkMove(state, {
      kind: 'bookmark',
      id: 'e2',
      target: { kind: 'insert', container: folderContainerKey('f-a'), index: 0 },
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(
      resolveContainerChildren(result.state, folderContainerKey('f-a')).map((c) => c.key),
    ).toEqual([entryItemKey('e2'), folderItemKey('f-b'), entryItemKey('e1')]);
  });

  it('does not mutate the input state', () => {
    const state = makeState();
    const snapshot = structuredClone(state);
    applyBookmarkMove(state, {
      kind: 'bookmark',
      id: 'e1',
      target: { kind: 'into', container: folderContainerKey('f-b') },
    });
    expect(state).toEqual(snapshot);
  });
});
