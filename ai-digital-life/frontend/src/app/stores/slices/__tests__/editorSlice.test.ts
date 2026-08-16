import { describe, expect, it } from 'vitest';
import { createStore } from 'zustand';
import { createEditorSlice, type EditorSlice } from '../editorSlice';

function makeStore() {
  return createStore<EditorSlice>((set, get) => ({
    ...createEditorSlice(set as never, get as never),
  }));
}

describe('editorSlice file tree click state', () => {
  it('clicking a node records the clicked node and clears the root selection', () => {
    const store = makeStore();
    store.getState().setFileTreeClickedWorkspaceRoot('ws-2');
    store.getState().setFileTreeClickedNode('ws-1', 'docs', 'directory');

    expect(store.getState().fileTreeClickedWorkspaceId).toBe('ws-1');
    expect(store.getState().fileTreeClickedPath).toBe('docs');
    expect(store.getState().fileTreeClickedKind).toBe('directory');
    expect(store.getState().fileTreeClickedWorkspaceRoot).toBeUndefined();
  });

  it('clicking a node syncs the navigator active workspace to that node workspace', () => {
    // 复现多工作区 bug：用户先点了 B 顶级目录（高亮在 B），随后回到 A 工作区里点击节点。
    // 点击节点后，"选中工作区"应同步为该节点所属工作区（A），而非停留在 B。
    const store = makeStore();
    store.getState().setFileNavigatorActiveWorkspace('ws-2');
    store.getState().setFileTreeClickedNode('ws-1', 'src', 'directory');

    expect(store.getState().fileNavigatorActiveWorkspaceId).toBe('ws-1');
  });

  it('clicking the workspace root selects the root and keeps the active workspace', () => {
    const store = makeStore();
    store.getState().setFileTreeClickedNode('ws-1', 'src', 'directory');
    store.getState().setFileTreeClickedWorkspaceRoot('ws-2');

    expect(store.getState().fileTreeClickedWorkspaceRoot).toBe('ws-2');
    expect(store.getState().fileTreeClickedWorkspaceId).toBe('ws-2');
    expect(store.getState().fileTreeClickedPath).toBeUndefined();
    expect(store.getState().fileNavigatorActiveWorkspaceId).toBe('ws-1');
  });

  it('clearFileTreeClickedNode clears both node and root selection', () => {
    const store = makeStore();
    store.getState().setFileTreeClickedNode('ws-1', 'src', 'directory');
    store.getState().clearFileTreeClickedNode();

    expect(store.getState().fileTreeClickedWorkspaceId).toBeUndefined();
    expect(store.getState().fileTreeClickedPath).toBeUndefined();
    expect(store.getState().fileTreeClickedWorkspaceRoot).toBeUndefined();
  });
});