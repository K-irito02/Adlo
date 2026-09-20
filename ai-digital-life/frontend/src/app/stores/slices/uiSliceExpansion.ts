/**
 * UI 展开状态切片
 * 管理文件树/变更树的展开状态
 */
import type { StoreState } from '../StoreState';
import { persistField } from '../persisted/apply';
import type { TreeExpansion, UISlice } from './uiSliceTypes';

/** 空展开态单例（按工作区缺省时复用，避免每次都 new 一个 {}） */
const EMPTY_TREE_EXPANSION: TreeExpansion = { expanded: {} };

// ───────────────────────────────────────────────────────────
// 文件侧 / 变更侧（TreeExpansion）共享辅助函数 —— 三条转移规则
// （变更侧与文件侧同构，复用同一语义）
// ───────────────────────────────────────────────────────────

/**
 * 手动设置某目录的展开态（规则 1、2）：
 * - 展开（true）→ `expanded[k]=true`，并**删除** `manualCollapsed[k]`（用户亲手展开了）；
 * - 折叠（false）→ `expanded[k]=false`，并**记录** `manualCollapsed[k]=true`（用户亲手折叠）。
 *
 * 短路：当目标态与当前态完全等价时才返回原引用（避免无谓落盘）。
 * 注意：手动折叠一个 expanded[k] 已是 false 的路径时，只要它尚未被记录进
 * `manualCollapsed`，就**必须**仍写出 `manualCollapsed[k]=true`——这正是旧版
 * 扁平 `setTreePathExpandedInState` "值已相等就早退"会丢掉的意图（裁定 6）。
 */
function applySetExpanded(current: TreeExpansion, path: string, expanded: boolean): TreeExpansion {
  const manual = current.manualCollapsed;
  if (expanded) {
    if (current.expanded[path] === true && (manual === undefined || !(path in manual))) {
      return current;
    }
    const nextManual = { ...(manual ?? {}) };
    delete nextManual[path];
    return { expanded: { ...current.expanded, [path]: true }, manualCollapsed: nextManual };
  }
  if (current.expanded[path] === false && manual !== undefined && manual[path] === true) {
    return current;
  }
  return {
    expanded: { ...current.expanded, [path]: false },
    manualCollapsed: { ...(manual ?? {}), [path]: true },
  };
}

/**
 * 自动展开链（规则 3）：逐段展开祖先目录，但遇到 `manualCollapsed` 中记录过的
 * 目录就**跳过**并记入 `blocked`（让用户看到"被你折叠的目录没有被自动展开"）。
 *
 * 短路：`changed` 为 false 时返回原引用，调用方据此跳过落盘——否则每次点开一个
 * 已展开目录都会触发一次写盘。
 */
function expandTreePathChainInState(
  current: TreeExpansion,
  path: string,
): { next: TreeExpansion; blocked: string[] } {
  const blocked: string[] = [];
  const expanded = { ...current.expanded };
  let changed = false;
  const segments = path.split('/').filter(Boolean);
  let currentPath = '';
  for (let index = 0; index < segments.length - 1; index += 1) {
    currentPath = currentPath ? `${currentPath}/${segments[index]}` : segments[index];
    if (current.manualCollapsed?.[currentPath]) {
      blocked.push(currentPath);
      continue;
    }
    if (!expanded[currentPath]) {
      expanded[currentPath] = true;
      changed = true;
    }
  }
  const next: TreeExpansion = changed ? { ...current, expanded } : current;
  return { next, blocked };
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
        const current = state.expandedFileTreePaths[workspaceId] ?? EMPTY_TREE_EXPANSION;
        const next = applySetExpanded(current, path, expanded);
        if (next === current) {
          return state;
        }
        const allPaths = { ...state.expandedFileTreePaths, [workspaceId]: next };
        return persistField('adl:files.dirExpanded', allPaths);
      }),
    toggleFileTreePath: (workspaceId, path) =>
      set((state) => {
        const current = state.expandedFileTreePaths[workspaceId] ?? EMPTY_TREE_EXPANSION;
        const next = applySetExpanded(current, path, !(current.expanded[path] ?? false));
        if (next === current) {
          return state;
        }
        const allPaths = { ...state.expandedFileTreePaths, [workspaceId]: next };
        return persistField('adl:files.dirExpanded', allPaths);
      }),
    expandFileTreePathChain: (workspaceId, path) => {
      const state = _get();
      const current = state.expandedFileTreePaths[workspaceId] ?? EMPTY_TREE_EXPANSION;
      const { next, blocked } = expandTreePathChainInState(current, path);
      if (next !== current) {
        set(
          persistField('adl:files.dirExpanded', {
            ...state.expandedFileTreePaths,
            [workspaceId]: next,
          }),
        );
      }
      return { blocked };
    },
    collapseAllFileTreePaths: (workspaceId) =>
      set((state) =>
        persistField('adl:files.dirExpanded', {
          ...state.expandedFileTreePaths,
          [workspaceId]: {
            expanded: {},
            manualCollapsed: state.expandedFileTreePaths[workspaceId]?.manualCollapsed,
          },
        }),
      ),
    setChangesTreePathExpanded: (workspaceId, path, expanded) =>
      set((state) => {
        const current = state.expandedChangesTreePaths[workspaceId] ?? EMPTY_TREE_EXPANSION;
        const next = applySetExpanded(current, path, expanded);
        if (next === current) {
          return state;
        }
        const allPaths = { ...state.expandedChangesTreePaths, [workspaceId]: next };
        return persistField('adl:changes.dirExpanded', allPaths);
      }),
    toggleChangesTreePath: (workspaceId, path) =>
      set((state) => {
        const current = state.expandedChangesTreePaths[workspaceId] ?? EMPTY_TREE_EXPANSION;
        const next = applySetExpanded(current, path, !(current.expanded[path] ?? false));
        if (next === current) {
          return state;
        }
        const allPaths = { ...state.expandedChangesTreePaths, [workspaceId]: next };
        return persistField('adl:changes.dirExpanded', allPaths);
      }),
    expandChangesTreePathChain: (workspaceId, path) => {
      const state = _get();
      const current = state.expandedChangesTreePaths[workspaceId] ?? EMPTY_TREE_EXPANSION;
      const { next, blocked } = expandTreePathChainInState(current, path);
      if (next !== current) {
        set(
          persistField('adl:changes.dirExpanded', {
            ...state.expandedChangesTreePaths,
            [workspaceId]: next,
          }),
        );
      }
      return { blocked };
    },
    collapseAllChangesTreePaths: (workspaceId) =>
      set((state) =>
        persistField('adl:changes.dirExpanded', {
          ...state.expandedChangesTreePaths,
          [workspaceId]: {
            expanded: {},
            manualCollapsed: state.expandedChangesTreePaths[workspaceId]?.manualCollapsed,
          },
        }),
      ),
  };
}
