/**
 * UI 展开状态切片
 * 管理文件树/变更树的展开状态
 */
import type { StoreState } from '../StoreState';
import { makePersistedWriter } from '../shared';
import type { TreeExpansionState, UISlice } from './uiSliceTypes';
import { FILE_TREE_EXPANDED_KEY, CHANGES_TREE_EXPANDED_KEY } from './uiSliceTypes';

const writeFileTreeExpanded = makePersistedWriter(FILE_TREE_EXPANDED_KEY);
const writeChangesTreeExpanded = makePersistedWriter(CHANGES_TREE_EXPANDED_KEY);

function setTreePathExpandedInState(
  current: TreeExpansionState,
  path: string,
  expanded: boolean,
): TreeExpansionState {
  if ((current[path] ?? false) === expanded) {
    return current;
  }
  return { ...current, [path]: expanded };
}

function toggleTreePathExpandedInState(
  current: TreeExpansionState,
  path: string,
): TreeExpansionState {
  return { ...current, [path]: !(current[path] ?? false) };
}

function expandTreePathChainInState(current: TreeExpansionState, path: string): TreeExpansionState {
  let next = current;
  let changed = false;
  const segments = path.split('/').filter(Boolean);
  let currentPath = '';
  for (let i = 0; i < segments.length - 1; i += 1) {
    currentPath = currentPath ? `${currentPath}/${segments[i]}` : segments[i];
    if (next[currentPath]) {
      continue;
    }
    if (!changed) {
      next = { ...current };
      changed = true;
    }
    next[currentPath] = true;
  }
  return next;
}

export type UIExpansionSlice = Pick<
  UISlice,
  | 'expandedFileTreePaths'
  | 'expandedChangesTreePaths'
  | 'setFileTreePathExpanded'
  | 'toggleFileTreePath'
  | 'expandFileTreePathChain'
  | 'collapseAllFileTreePaths'
  | 'setChangesTreePathExpanded'
  | 'toggleChangesTreePath'
  | 'expandChangesTreePathChain'
  | 'collapseAllChangesTreePaths'
>;

export function createUIExpansionSlice(
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): UIExpansionSlice {
  return {
    expandedFileTreePaths: {},
    expandedChangesTreePaths: {},

    setFileTreePathExpanded: (workspaceId, path, expanded) =>
      set((state) => {
        const current = state.expandedFileTreePaths[workspaceId] ?? {};
        const next = setTreePathExpandedInState(current, path, expanded);
        if (next === current) {
          return state;
        }
        const allPaths = { ...state.expandedFileTreePaths, [workspaceId]: next };
        writeFileTreeExpanded(allPaths);
        return { expandedFileTreePaths: allPaths };
      }),
    toggleFileTreePath: (workspaceId, path) =>
      set((state) => {
        const current = state.expandedFileTreePaths[workspaceId] ?? {};
        const next = toggleTreePathExpandedInState(current, path);
        const allPaths = { ...state.expandedFileTreePaths, [workspaceId]: next };
        writeFileTreeExpanded(allPaths);
        return { expandedFileTreePaths: allPaths };
      }),
    expandFileTreePathChain: (workspaceId, path) =>
      set((state) => {
        const current = state.expandedFileTreePaths[workspaceId] ?? {};
        const next = expandTreePathChainInState(current, path);
        if (next === current) {
          return state;
        }
        const allPaths = { ...state.expandedFileTreePaths, [workspaceId]: next };
        writeFileTreeExpanded(allPaths);
        return { expandedFileTreePaths: allPaths };
      }),
    collapseAllFileTreePaths: (workspaceId) =>
      set((state) => {
        const allPaths = { ...state.expandedFileTreePaths, [workspaceId]: {} };
        writeFileTreeExpanded(allPaths);
        return { expandedFileTreePaths: allPaths };
      }),
    setChangesTreePathExpanded: (path, expanded) =>
      set((state) => {
        const next = setTreePathExpandedInState(state.expandedChangesTreePaths, path, expanded);
        if (next === state.expandedChangesTreePaths) {
          return state;
        }
        writeChangesTreeExpanded(next);
        return { expandedChangesTreePaths: next };
      }),
    toggleChangesTreePath: (path) =>
      set((state) => {
        const next = toggleTreePathExpandedInState(state.expandedChangesTreePaths, path);
        writeChangesTreeExpanded(next);
        return { expandedChangesTreePaths: next };
      }),
    expandChangesTreePathChain: (path) =>
      set((state) => {
        const next = expandTreePathChainInState(state.expandedChangesTreePaths, path);
        if (next === state.expandedChangesTreePaths) {
          return state;
        }
        writeChangesTreeExpanded(next);
        return { expandedChangesTreePaths: next };
      }),
    collapseAllChangesTreePaths: () => {
      writeChangesTreeExpanded({});
      set({ expandedChangesTreePaths: {} });
    },
  };
}
