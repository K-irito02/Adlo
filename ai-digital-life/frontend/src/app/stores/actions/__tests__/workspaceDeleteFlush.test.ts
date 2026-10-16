import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createStore } from 'zustand';
import { createWorkspaceActions } from '../workspaceActions';
import {
  setPendingEditorText,
  scopedFileKey,
  peekPendingEditorTextByKey,
} from '../../cacheHelpers';

function makeStore() {
  const store = createStore<Record<string, unknown>>((set, get) => {
    const actions = createWorkspaceActions(set as never, () => get() as never);
    return {
      appInfo: { currentWorkspace: { id: 'ws-1', path: '/repo' } },
      recentWorkspaces: [{ id: 'ws-1', path: '/repo' }],
      workspaceTrees: { 'ws-1': [] },
      workspaceTreeErrors: {},
      selectedFilePath: 'gone.txt',
      fileContent: 'draft\n',
      fileMedia: null,
      fileMediaLoading: false,
      openTabs: [{ path: 'gone.txt' }],
      errorToasts: [],
      dirtyEditorPaths: ['gone.txt'],
      externalFileChange: { path: 'gone.txt', lastModifiedAt: 1 },
      reportError: vi.fn(() => 'toast-id'),
      clearErrorToasts: vi.fn(),
      ...actions,
    } as unknown as Record<string, unknown>;
  });
  return { store };
}

describe('deleteWorkspaceFile 不复活 (P4 F2)', () => {
  beforeEach(() => {
    vi.stubGlobal('digitalLife', {
      workspace: {
        deleteFile: vi.fn(async () => ({ ok: true, data: true })),
        listTree: vi.fn(async () => ({ ok: true, data: { tree: [] } })),
        listTreeForWorkspace: vi.fn(async () => ({ ok: true, data: { tree: [] } })),
        setEditorDirtyPaths: vi.fn(async () => ({ ok: true, data: true })),
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('删除脏文件：草稿 + 脏标记 + 选中 + 外部态一并清理', async () => {
    const { store } = makeStore();
    setPendingEditorText(scopedFileKey('ws-1', 'gone.txt'), 'draft\n');
    await (
      store.getState() as unknown as { deleteWorkspaceFile: (p: string) => Promise<void> }
    ).deleteWorkspaceFile('gone.txt');
    expect(peekPendingEditorTextByKey(scopedFileKey('ws-1', 'gone.txt'))).toBeUndefined();
    const state = store.getState() as unknown as {
      dirtyEditorPaths: string[];
      selectedFilePath?: string;
      externalFileChange?: unknown;
      openTabs: { path: string }[];
    };
    expect(state.dirtyEditorPaths).toEqual([]);
    expect(state.selectedFilePath).toBeUndefined();
    expect(state.externalFileChange).toBeUndefined();
    expect(state.openTabs).toEqual([]);
  });
});
