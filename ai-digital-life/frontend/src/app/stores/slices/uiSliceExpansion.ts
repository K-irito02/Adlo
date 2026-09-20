/**
 * UI 展开状态切片
 * 管理文件树/变更树的展开状态
 */
import type { StoreState } from '../StoreState';
import { persistField } from '../persisted/apply';
import type { TreeExpansionState, UISlice } from './uiSliceTypes';

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
        return persistField('adl:files.dirExpanded', allPaths);
      }),
    toggleFileTreePath: (workspaceId, path) =>
      set((state) => {
        const current = state.expandedFileTreePaths[workspaceId] ?? {};
        const next = toggleTreePathExpandedInState(current, path);
        const allPaths = { ...state.expandedFileTreePaths, [workspaceId]: next };
        return persistField('adl:files.dirExpanded', allPaths);
      }),
    expandFileTreePathChain: (workspaceId, path) =>
      set((state) => {
        const current = state.expandedFileTreePaths[workspaceId] ?? {};
        const next = expandTreePathChainInState(current, path);
        if (next === current) {
          return state;
        }
        const allPaths = { ...state.expandedFileTreePaths, [workspaceId]: next };
        return persistField('adl:files.dirExpanded', allPaths);
      }),
    collapseAllFileTreePaths: (workspaceId) =>
      set((state) =>
        persistField('adl:files.dirExpanded', {
          ...state.expandedFileTreePaths,
          [workspaceId]: {},
        }),
      ),
    setChangesTreePathExpanded: (path, expanded) =>
      set((state) => {
        const next = setTreePathExpandedInState(state.expandedChangesTreePaths, path, expanded);
        if (next === state.expandedChangesTreePaths) {
          return state;
        }
        return persistField('adl:changes.dirExpanded', next);
      }),
    toggleChangesTreePath: (path) =>
      set((state) =>
        persistField(
          'adl:changes.dirExpanded',
          toggleTreePathExpandedInState(state.expandedChangesTreePaths, path),
        ),
      ),
    expandChangesTreePathChain: (path) =>
      set((state) => {
        const next = expandTreePathChainInState(state.expandedChangesTreePaths, path);
        if (next === state.expandedChangesTreePaths) {
          return state;
        }
        return persistField('adl:changes.dirExpanded', next);
      }),
    collapseAllChangesTreePaths: () => {
      set(persistField('adl:changes.dirExpanded', {}));
    },
  };
}
