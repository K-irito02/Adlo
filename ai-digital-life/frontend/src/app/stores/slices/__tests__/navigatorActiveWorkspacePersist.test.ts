import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createStore } from 'zustand';
import { createEditorSlice, type EditorSlice } from '../editorSlice';
import { flushCrossSliceWrites } from '../../storageHelpers';
import { registry } from '../../persisted/registry';
import { hydrateAll, resetHydrationForTest } from '../../persisted/hydrate';

const FILES_KEY = 'adl:files.activeWorkspace';
const CHANGES_KEY = 'adl:changes.activeWorkspace';

function makeStore() {
  return createStore<EditorSlice>((set, get) => ({
    ...createEditorSlice(set as never, get as never),
  }));
}

describe('navigator active workspace persistence (事项1 方案A)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHydrationForTest();
  });

  afterEach(() => {
    localStorage.clear();
    resetHydrationForTest();
  });

  it('点击文件树节点后选中工作区落盘', () => {
    const store = makeStore();
    store.getState().setFileTreeClickedNode('ws-1', 'src', 'directory');
    flushCrossSliceWrites();

    expect(JSON.parse(localStorage.getItem(FILES_KEY) ?? 'null')).toBe('ws-1');
  });

  it('setFileNavigatorActiveWorkspace 直接选中落盘，清除后落盘 null', () => {
    const store = makeStore();
    store.getState().setFileNavigatorActiveWorkspace('ws-2');
    flushCrossSliceWrites();
    expect(JSON.parse(localStorage.getItem(FILES_KEY) ?? 'null')).toBe('ws-2');

    store.getState().clearFileTreeClickedNode();
    flushCrossSliceWrites();
    expect(JSON.parse(localStorage.getItem(FILES_KEY) ?? 'null')).toBeNull();
  });

  it('点击变更树节点/根目录后选中工作区落盘，清除后落盘 null', () => {
    const store = makeStore();
    store.getState().setChangesTreeClickedNode('ws-1', 'src/App.tsx', 'file');
    store.getState().setChangesTreeClickedWorkspaceRoot('ws-2');
    flushCrossSliceWrites();
    expect(JSON.parse(localStorage.getItem(CHANGES_KEY) ?? 'null')).toBe('ws-2');

    store.getState().clearChangesTreeClickedNode();
    flushCrossSliceWrites();
    expect(JSON.parse(localStorage.getItem(CHANGES_KEY) ?? 'null')).toBeNull();
  });

  it('登记条目 read：null 合法、字符串通过、非字符串回退', () => {
    const filesRead = registry[FILES_KEY].read!;
    const changesRead = registry[CHANGES_KEY].read!;
    expect(filesRead(null)).toBeNull();
    expect(filesRead('ws-9')).toBe('ws-9');
    expect(filesRead(42)).toBeUndefined();
    expect(filesRead({})).toBeUndefined();
    expect(changesRead(null)).toBeNull();
    expect(changesRead('ws-9')).toBe('ws-9');
    expect(changesRead(42)).toBeUndefined();
  });

  it('hydrateAll 把落盘选中态水合回 store 字段', () => {
    localStorage.setItem(FILES_KEY, JSON.stringify('ws-f'));
    localStorage.setItem(CHANGES_KEY, JSON.stringify('ws-c'));
    resetHydrationForTest();

    const { patch, dirtyKeys } = hydrateAll();
    expect(patch.fileNavigatorActiveWorkspaceId).toBe('ws-f');
    expect(patch.changesNavigatorActiveWorkspaceId).toBe('ws-c');
    expect(dirtyKeys).not.toContain(FILES_KEY);
    expect(dirtyKeys).not.toContain(CHANGES_KEY);
  });

  it('hydrateAll 对非法值回退 null 并记脏', () => {
    localStorage.setItem(FILES_KEY, JSON.stringify(42));
    resetHydrationForTest();

    const { patch, dirtyKeys } = hydrateAll();
    expect(patch.fileNavigatorActiveWorkspaceId).toBeNull();
    expect(dirtyKeys).toContain(FILES_KEY);
  });
});
