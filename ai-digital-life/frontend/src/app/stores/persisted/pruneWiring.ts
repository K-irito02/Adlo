import type { PruneCtx } from './entry';
import type { StoreState } from '../StoreState';
import { applyPrunePatch, pruneByTabId } from './prune';
import { persist } from './persist';
import { registryEntries, type RegistryKey } from './registry';
import { terminalRegionCollapseStore } from '../../features/terminal/terminalRegionCollapse';
import { terminalCwdStore } from '../../features/terminal/terminalCwdStore';
import { terminalHistoryStore } from '../../features/terminal/terminalHistoryStore';

/**
 * 懒剪五入口的接线层（规格 §3.5.1）。
 *
 * 五个入口职责互斥：
 * - applyWorkspacePrune：工作区列表就绪后（setRecentWorkspaces / bootstrap），
 *   按工作区存在性 + 标签存在性剔除；
 * - applyTreeLoadedPrune：某工作区树成功加载后，剔除该工作区已不存在的目录；
 *   树未加载 / 加载失败时不调用（R2）；
 * - applyTabPrune：标签集合变化后（终端 / 浏览器关标签），剔除已不存在标签的条目；
 * - applyWorkspaceRemoved：工作区被移除时（cleanupRemovedWorkspaceTree 末尾），
 *   直接剔除该工作区在全部按工作区隔离条目中的记录 —— 不依赖参照清单是否就绪
 *   （被移除的工作区必不在新清单内，按存在性剪会有"空清单跳过"的误伤风险，
 *   故此处按传入 id 精确删除）。
 *
 * 安全不变量：workspaceIds 为空一律跳过（构造期列表尚未载入，此时剪枝会误删
 * 全部按工作区隔离的状态 —— 规格 §3.5.1 首要安全规则 / 风险 R7）。
 *
 * tabIds 取终端标签与浏览器标签的并集：`tab:` 键命名空间是浏览器标签 id
 *（createUiId('browser')），终端标签是另一命名空间（createUiId('terminal')），
 * 二者永不相撞 —— 若只取其一，另一侧的存活展开会被误判为孤儿删掉。
 *
 * 乙类条目（终端三个外部微型存储 regionCollapse / cwdByTab / historyIndex，
 * Task 10 延期）：它们没有 store 字段，不在 pruneRegistry 内，在此经模块自身
 * 的 load/save 清理（save 系走 persist 唯一写通道）。viewPrefs 是全局作用域，
 * 无引用可剪，不在此列。
 */
let loadedDirPaths = new Map<string, ReadonlySet<string>>();

/**
 * 指向真实 app store 的引用，由 slicedStore 在创建后注入。
 *
 * 为什么不用 `import { useAppStore } from '../slicedStore'`：
 * 切片（workspace/terminal/browserTabs）与 action 模块都要调本文件的入口，
 * 而它们又被 slicedStore 导入 —— 静态导入会形成
 * slicedStore → slice → pruneWiring → slicedStore 的环，模块求值顺序一旦反转
 *（如单测先 import 切片）就会拿到未初始化的命名空间而崩溃。注入把边反转为
 * 单向（slicedStore → pruneWiring），任何导入顺序都安全。
 *
 * 未注入时各入口静默跳过：切面单测用迷你 store，本来就不该碰真实 store。
 */
interface PruneStoreRef {
  getState: () => StoreState;
  setState: (partial: Partial<StoreState>) => void;
}

let storeRef: PruneStoreRef | undefined;

export function registerPruneStore(ref: PruneStoreRef): void {
  storeRef = ref;
}

/** 供测试断言"生产接线存在"（slicedStore 求值即注册） */
export function isPruneStoreRegistered(): boolean {
  return storeRef !== undefined;
}

function currentCtx(): PruneCtx | undefined {
  const ref = storeRef;
  if (!ref) {
    return undefined;
  }
  const state = ref.getState();
  return {
    workspaceIds: new Set(state.recentWorkspaces.map((workspace) => workspace.id)),
    loadedDirPaths,
    tabIds: new Set([
      ...state.terminalTabs.map((tab) => tab.id),
      ...state.browserTabs.map((tab) => tab.id),
    ]),
  };
}

/** 乙类外部存储：按标签存在性清理（tabIds 为空时跳过，与 pruneByTabId 一致） */
function pruneExternalTabStores(ctx: PruneCtx): void {
  if (ctx.tabIds.size === 0) {
    return;
  }
  const regionCollapse = terminalRegionCollapseStore.load();
  const prunedRegionCollapse = pruneByTabId(regionCollapse, ctx);
  if (prunedRegionCollapse.changed) {
    terminalRegionCollapseStore.save(prunedRegionCollapse.value);
  }
  const cwdByTab = terminalCwdStore.loadAll();
  const prunedCwd = pruneByTabId(cwdByTab, ctx);
  if (prunedCwd.changed) {
    terminalCwdStore.saveAll(prunedCwd.value);
  }
  const historyIndex = terminalHistoryStore.loadAll();
  const prunedHistoryIndex = pruneByTabId(historyIndex, ctx);
  if (prunedHistoryIndex.changed) {
    terminalHistoryStore.saveAll(prunedHistoryIndex.value);
  }
}

function runPrune(ctx: PruneCtx): void {
  const ref = storeRef;
  if (!ref) {
    return;
  }
  if (ctx.workspaceIds.size === 0) {
    // 参照清单未就绪 —— 剪枝会误删，直接跳过（规格 §3.5.1 / 风险 R7）
    return;
  }
  const snapshot = ref.getState() as unknown as Record<string, unknown>;
  const patch = applyPrunePatch(snapshot, ctx);
  for (const [field, fieldValue] of Object.entries(patch)) {
    const entry = registryEntries.find((candidate) => candidate.field === field);
    if (!entry) {
      continue;
    }
    persist(entry.key as RegistryKey, fieldValue as never);
  }
  if (Object.keys(patch).length > 0) {
    ref.setState(patch as Partial<StoreState>);
  }
  pruneExternalTabStores(ctx);
}

export function applyWorkspacePrune(): void {
  const ctx = currentCtx();
  if (ctx) {
    runPrune(ctx);
  }
}

export function applyTreeLoadedPrune(workspaceId: string, dirPaths: ReadonlySet<string>): void {
  loadedDirPaths = new Map(loadedDirPaths).set(workspaceId, dirPaths);
  const ctx = currentCtx();
  if (ctx) {
    runPrune(ctx);
  }
}

export function applyTabPrune(tabIds?: ReadonlySet<string>): void {
  const ctx = currentCtx();
  if (!ctx) {
    return;
  }
  runPrune(tabIds === undefined ? ctx : { ...ctx, tabIds });
}

/**
 * 工作区被移除时：遍历登记表中全部按工作区隔离的甲类条目，剔除该工作区。
 *
 * 与 applyWorkspacePrune 的区别：不经过"参照清单存在性"判定 —— 调用点
 * （removeWorkspaceFromSidebar → cleanupRemovedWorkspaceTree）传入的 id
 * 精确指向刚被移除的工作区，无"构造期空清单误删"的风险（规格 §3.5.1 / R7
 * 不适用），故直接按 id 删除。
 *
 * 只处理甲类条目（有 store 字段）：乙类当前均为 byTabId / global 作用域，
 * 无按工作区隔离的条目；乙类剪枝仍由标签触发的 pruneExternalTabStores 负责，
 * 此处不做"工作区移除级联清理标签存储"的假完整（标签归属清理归关标签路径）。
 */
export function applyWorkspaceRemoved(workspaceId: string): void {
  const ref = storeRef;
  if (!ref) {
    return;
  }
  const snapshot = ref.getState() as unknown as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const entry of registryEntries) {
    if (entry.scope !== 'byWorkspaceId') {
      continue;
    }
    // 乙类条目没有 store 字段（当前无 byWorkspaceId 乙类，此处为防御性跳过）
    if (entry.field === undefined) {
      continue;
    }
    const field = entry.field as string;
    const value = snapshot[field];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      continue;
    }
    const record = value as Record<string, unknown>;
    if (!(workspaceId in record)) {
      continue;
    }
    const next = { ...record };
    delete next[workspaceId];
    patch[field] = next;
    persist(entry.key as RegistryKey, next as never);
  }
  if (Object.keys(patch).length > 0) {
    ref.setState(patch as Partial<StoreState>);
  }
}

/** 仅供测试重置已加载目录缓存 */
export function resetLoadedDirPathsForTest(): void {
  loadedDirPaths = new Map();
}
