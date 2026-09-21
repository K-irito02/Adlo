import type { PruneCtx, PruneResult } from './entry';
import { registryEntries } from './registry';
import { repairManualCollapsed } from './parsers';
import type { TreeExpansion } from '../slices/uiSliceTypes';
import type { WorkspaceTreeNode } from '@ai-digital-life/kernel';

/**
 * 非工作区保留键：这类键与工作区 id 同处一个按工作区隔离的映射里，
 * 但自身不是工作区（如终端"默认终端目录" `__independent__`），
 * 按工作区存在性剪枝时必须豁免，否则重启必丢（事项 3 根因）。
 * 引用该常量的 UI 侧同名定义见 TerminalPanel / MultiWorkspaceTerminal。
 */
export const NON_WORKSPACE_PRESERVED_KEYS: ReadonlySet<string> = new Set(['__independent__']);

const EMPTY_PRESERVE: ReadonlySet<string> = new Set();

/**
 * 按工作区存在性剪枝。
 *
 * 安全不变量：workspaceIds 为空时**必须**跳过 —— store 构造期工作区列表尚未载入，
 * 此时剪枝会误删全部按工作区隔离的状态（规格 §3.5.1 首要安全规则 / 风险 R7）。
 */
export function pruneByWorkspaceId<T extends Record<string, unknown>>(
  value: T,
  ctx: PruneCtx,
  preserve: ReadonlySet<string> = EMPTY_PRESERVE,
): PruneResult<T> {
  if (ctx.workspaceIds.size === 0) {
    return { value, changed: false };
  }
  const next: Record<string, unknown> = {};
  let changed = false;
  for (const [workspaceId, entryValue] of Object.entries(value)) {
    if (ctx.workspaceIds.has(workspaceId) || preserve.has(workspaceId)) {
      next[workspaceId] = entryValue;
    } else {
      changed = true;
    }
  }
  return changed ? { value: next as T, changed: true } : { value, changed: false };
}

/**
 * 按"工作区存在性 + 该工作区已加载的目录路径"剪枝。
 *
 * 安全不变量：
 * - workspaceIds 为空 → 跳过；
 * - 该工作区不在 loadedDirPaths 内（树未加载 / 加载失败）→ 该工作区整体跳过（规格 §3.5.1 / 风险 R2）。
 */
export function pruneDirPathsByWorkspace<T extends Record<string, Record<string, unknown>>>(
  value: T,
  ctx: PruneCtx,
): PruneResult<T> {
  if (ctx.workspaceIds.size === 0) {
    return { value, changed: false };
  }
  const next: Record<string, Record<string, unknown>> = {};
  let changed = false;
  for (const [workspaceId, paths] of Object.entries(value)) {
    if (!ctx.workspaceIds.has(workspaceId)) {
      changed = true;
      continue;
    }
    const loadedPaths = ctx.loadedDirPaths.get(workspaceId);
    if (!loadedPaths) {
      next[workspaceId] = paths;
      continue;
    }
    const keptPaths: Record<string, unknown> = {};
    for (const [path, pathValue] of Object.entries(paths)) {
      if (loadedPaths.has(path)) {
        keptPaths[path] = pathValue;
      } else {
        changed = true;
      }
    }
    next[workspaceId] = keptPaths;
  }
  return changed ? { value: next as T, changed: true } : { value, changed: false };
}

/** 按标签存在性剪枝；tabIds 为空时跳过 */
export function pruneByTabId<T extends Record<string, unknown>>(
  value: T,
  ctx: PruneCtx,
): PruneResult<T> {
  if (ctx.tabIds.size === 0) {
    return { value, changed: false };
  }
  const next: Record<string, unknown> = {};
  let changed = false;
  for (const [tabId, entryValue] of Object.entries(value)) {
    if (ctx.tabIds.has(tabId)) {
      next[tabId] = entryValue;
    } else {
      changed = true;
    }
  }
  return changed ? { value: next as T, changed: true } : { value, changed: false };
}

/**
 * 按"工作区 / 标签引用是否仍存在"剪枝浏览器的树展开态。
 *
 * 键形态（`browserTabTreeExpanded`）：
 *   - `workspace:<wsId>` → 按工作区存在性剪
 *   - `folder:<folderId>` → **不剪**（文件夹删除路径尚未接入剪枝，见计划子项目 F3 / Task 28 收尾文档）
 *   - `tab:<uniqueKey>:<tabId>` → 取最后一个 `:` 之后作为 tabId，按标签存在性剪
 *   - `history:...` → 早于本键的历史树路径，**不剪**
 *
 * 安全不变量：任一份参照清单为空即整表跳过（规格 §3.5.1 首要安全规则）——
 * store 构造期工作区/标签列表尚未载入，此时按存在性剪枝会误删全部展开态。
 */
export function pruneBrowserTreeExpanded(
  value: Record<string, boolean>,
  ctx: PruneCtx,
): PruneResult<Record<string, boolean>> {
  if (ctx.workspaceIds.size === 0 || ctx.tabIds.size === 0) {
    return { value, changed: false };
  }
  const next: Record<string, boolean> = {};
  let changed = false;
  for (const [path, expanded] of Object.entries(value)) {
    const isOrphan =
      (path.startsWith('workspace:') && !ctx.workspaceIds.has(path.slice('workspace:'.length))) ||
      (path.startsWith('tab:') && !ctx.tabIds.has(path.slice(path.lastIndexOf(':') + 1)));
    if (isOrphan) {
      changed = true;
      continue;
    }
    next[path] = expanded;
  }
  return changed ? { value: next, changed: true } : { value, changed: false };
}

/** 剔除某个路径自身及其全部子孙路径（删除目录 / 重命名后的重映射用） */
export function prunePathPrefix<T extends Record<string, unknown>>(
  paths: T,
  removedPath: string,
): PruneResult<T> {
  const prefix = `${removedPath}/`;
  const next: Record<string, unknown> = {};
  let changed = false;
  for (const [path, pathValue] of Object.entries(paths)) {
    if (path === removedPath || path.startsWith(prefix)) {
      changed = true;
      continue;
    }
    next[path] = pathValue;
  }
  return changed ? { value: next as T, changed: true } : { value: paths, changed: false };
}

/**
 * 按"工作区存在性 + 已加载目录路径"剪枝文件树展开态（`Record<workspaceId, TreeExpansion>`）。
 *
 * 在 `pruneDirPathsByWorkspace` 的基础上额外做两件事：
 * 1. 对 `expanded` 与 `manualCollapsed` **两个**成员分别按 loadedDirPaths 清理
 *    （只保留树中仍存在的目录路径；不会加载的树整表保留——与 R2 一致）。
 * 2. 再次应用跨字段不变量修复（裁定 2 的防御层）：丢弃 `manualCollapsed[k]` 中
 *    与 `expanded[k] === true` 冲突的项。有人可能绕过 `read` 直接构造 `TreeExpansion`，
 *    故剪枝侧必须独立保证不变量成立。
 *
 * 安全不变量：workspaceIds 为空时**必须**整表跳过（与 `pruneDirPathsByWorkspace` 一致）。
 * 引用等价：某工作区两个成员都无需变动时返回原 `TreeExpansion` 引用，整表都无需变动时返回
 * 原 `value` 引用，避免无谓的下游写盘。
 */
export function pruneDirExpansion(
  value: Record<string, TreeExpansion>,
  ctx: PruneCtx,
): PruneResult<Record<string, TreeExpansion>> {
  if (ctx.workspaceIds.size === 0) {
    return { value, changed: false };
  }
  const next: Record<string, TreeExpansion> = {};
  let changed = false;
  for (const [workspaceId, expansion] of Object.entries(value)) {
    if (!ctx.workspaceIds.has(workspaceId)) {
      changed = true;
      continue;
    }
    const expandedResult = pruneDirPathsByWorkspace({ [workspaceId]: expansion.expanded }, ctx);
    const prunedExpanded = expandedResult.value[workspaceId] ?? {};

    const manualRaw: Record<string, true> = expansion.manualCollapsed ?? {};
    const collapsedResult = pruneDirPathsByWorkspace({ [workspaceId]: manualRaw }, ctx);
    const prunedManualRaw = collapsedResult.value[workspaceId] ?? {};

    // 防御层修复（共享实现见 repairManualCollapsed）：expanded[k] === true ⇒ 丢弃 manualCollapsed[k]
    const repairedManual = repairManualCollapsed(prunedExpanded, prunedManualRaw);
    const keptManual = repairedManual !== undefined;
    // 修复是否真的丢掉了一项 —— 不能用 `keptManual` 当"有变动"信号：
    // 只要还有一项合法的 manualCollapsed 它即为 true，会把"什么都没剪掉"误判为已变动，
    // 于是每次剪枝都换新引用、触发无谓落盘。
    const repairDropped =
      (repairedManual !== undefined ? Object.keys(repairedManual).length : 0) !==
      Object.keys(prunedManualRaw).length;

    const workspaceChanged = expandedResult.changed || collapsedResult.changed || repairDropped;
    if (workspaceChanged) {
      changed = true;
      next[workspaceId] = {
        expanded: prunedExpanded,
        manualCollapsed: keptManual ? repairedManual : undefined,
      };
    } else {
      next[workspaceId] = expansion;
    }
  }
  return changed ? { value: next, changed: true } : { value, changed: false };
}

/**
 * 从一次性完整返回的工作区树中递归收集全部目录相对路径。
 *
 * 纯函数：调用方（树加载成功分支）在触发剪枝前用它构造 ctx.loadedDirPaths。
 * 只收 `kind === 'directory'` 的 path —— 文件路径从不参与目录剪枝。
 */
export function collectDirPaths(tree: WorkspaceTreeNode[]): ReadonlySet<string> {
  const paths = new Set<string>();
  const visit = (nodes: WorkspaceTreeNode[]): void => {
    for (const node of nodes) {
      if (node.kind !== 'directory') {
        continue;
      }
      paths.add(node.path);
      if (node.children.length > 0) {
        visit(node.children);
      }
    }
  };
  visit(tree);
  return paths;
}

/**
 * 遍历登记表中带有 prune 的条目，对传入的"内存当前值"逐条剪枝。
 * 由四个触发入口（pruneAfterWorkspacesKnown / pruneAfterTreeLoaded / pruneAfterTabsKnown / 删除路径）
 * 共用，避免每个入口各自列举要剪哪个字段。
 */
export function pruneRegistry(
  current: Record<string, unknown>,
  ctx: PruneCtx,
): PruneResult<Record<string, unknown>> {
  const patch: Record<string, unknown> = {};
  let changed = false;
  for (const entry of registryEntries) {
    if (!entry.prune) {
      continue;
    }
    // 乙类条目没有 store 字段，无法从 store 快照取值；其剪枝归 Task 15/17（见 brief）
    if (entry.field === undefined) {
      continue;
    }
    const field = entry.field as string;
    const value = current[field];
    if (value === undefined) {
      continue;
    }
    const result = entry.prune(value, ctx);
    if (result.changed) {
      patch[field] = result.value;
      changed = true;
    }
  }
  return { value: patch, changed };
}

/**
 * 编排入口：对 store 快照执行登记表剪枝，只返回"需要写回的字段补丁"。
 *
 * 空参照清单的安全规则由各条目自身的 prune 函数强制（workspaceIds/tabIds 为空
 * 即整表跳过，树未加载的工作区整体保留），此处不重复设防。
 */
export function applyPrunePatch(
  current: Record<string, unknown>,
  ctx: PruneCtx,
): Record<string, unknown> {
  return pruneRegistry(current, ctx).value;
}
