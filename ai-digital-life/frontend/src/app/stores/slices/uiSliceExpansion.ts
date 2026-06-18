/**
 * UI 展开状态切片
 * 管理文件树/变更树/会话标签的展开状态
 */
import type { StoreState } from '../StoreState';
import { createDebouncedWrite, writeJson } from '../shared';
import type { TreeExpansionState, UISlice } from './uiSliceTypes';
import {
  FILE_TREE_EXPANDED_KEY,
  CHANGES_TREE_EXPANDED_KEY,
  SESSION_TABS_EXPANDED_KEY,
} from './uiSliceTypes';

const { scheduleWrite } = createDebouncedWrite(50);

function setTreePathExpandedInState(
  current: TreeExpansionState,
  path: string,
  expanded: boolean
): TreeExpansionState {
  if ((current[path] ?? false) === expanded) {
    return current;
  }
  return { ...current, [path]: expanded };
}

function toggleTreePathExpandedInState(
  current: TreeExpansionState,
  path: string
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
  | 'expandedSessionWorkspaces'
  | 'setFileTreePathExpanded'
  | 'toggleFileTreePath'
  | 'expandFileTreePathChain'
  | 'collapseAllFileTreePaths'
  | 'setChangesTreePathExpanded'
  | 'toggleChangesTreePath'
  | 'expandChangesTreePathChain'
  | 'collapseAllChangesTreePaths'
  | 'toggleSessionWorkspace'
>;

export function createUIExpansionSlice(
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): UIExpansionSlice {
  return {
    expandedFileTreePaths: {},
    expandedChangesTreePaths: {},
    expandedSessionWorkspaces: {},

    setFileTreePathExpanded: (workspaceId, path, expanded) =>
      set((state) => {
        const current = state.expandedFileTreePaths[workspaceId] ?? {};
        const next = setTreePathExpandedInState(current, path, expanded);
        if (next === current) {
          return state;
        }
        const allPaths = { ...state.expandedFileTreePaths, [workspaceId]: next };
        scheduleWrite(FILE_TREE_EXPANDED_KEY, allPaths);
        return { expandedFileTreePaths: allPaths };
      }),
    toggleFileTreePath: (workspaceId, path) =>
      set((state) => {
        const current = state.expandedFileTreePaths[workspaceId] ?? {};
        const next = toggleTreePathExpandedInState(current, path);
        const allPaths = { ...state.expandedFileTreePaths, [workspaceId]: next };
        scheduleWrite(FILE_TREE_EXPANDED_KEY, allPaths);
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
        scheduleWrite(FILE_TREE_EXPANDED_KEY, allPaths);
        return { expandedFileTreePaths: allPaths };
      }),
    collapseAllFileTreePaths: (workspaceId) =>
      set((state) => {
        const allPaths = { ...state.expandedFileTreePaths, [workspaceId]: {} };
        scheduleWrite(FILE_TREE_EXPANDED_KEY, allPaths);
        return { expandedFileTreePaths: allPaths };
      }),
    setChangesTreePathExpanded: (path, expanded) =>
      set((state) => {
        const next = setTreePathExpandedInState(state.expandedChangesTreePaths, path, expanded);
        if (next === state.expandedChangesTreePaths) {
          return state;
        }
        scheduleWrite(CHANGES_TREE_EXPANDED_KEY, next);
        return { expandedChangesTreePaths: next };
      }),
    toggleChangesTreePath: (path) =>
      set((state) => {
        const next = toggleTreePathExpandedInState(state.expandedChangesTreePaths, path);
        scheduleWrite(CHANGES_TREE_EXPANDED_KEY, next);
        return { expandedChangesTreePaths: next };
      }),
    expandChangesTreePathChain: (path) =>
      set((state) => {
        const next = expandTreePathChainInState(state.expandedChangesTreePaths, path);
        if (next === state.expandedChangesTreePaths) {
          return state;
        }
        scheduleWrite(CHANGES_TREE_EXPANDED_KEY, next);
        return { expandedChangesTreePaths: next };
      }),
    collapseAllChangesTreePaths: () => {
      scheduleWrite(CHANGES_TREE_EXPANDED_KEY, {});
      set({ expandedChangesTreePaths: {} });
    },
    toggleSessionWorkspace: (workspaceId) =>
      set((state) => {
        const current = state.expandedSessionWorkspaces[workspaceId] ?? true;
        const next = { ...state.expandedSessionWorkspaces, [workspaceId]: !current };
        writeJson(SESSION_TABS_EXPANDED_KEY, next);
        return { expandedSessionWorkspaces: next };
      }),
  };
}
