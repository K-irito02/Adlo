import type { PruneCtx, PruneResult } from './entry';
import { registryEntries } from './registry';

/**
 * 按工作区存在性剪枝。
 *
 * 安全不变量：workspaceIds 为空时**必须**跳过 —— store 构造期工作区列表尚未载入，
 * 此时剪枝会误删全部按工作区隔离的状态（规格 §3.5.1 首要安全规则 / 风险 R7）。
 */
export function pruneByWorkspaceId<T extends Record<string, unknown>>(
  value: T,
  ctx: PruneCtx,
): PruneResult<T> {
  if (ctx.workspaceIds.size === 0) {
    return { value, changed: false };
  }
  const next: Record<string, unknown> = {};
  let changed = false;
  for (const [workspaceId, entryValue] of Object.entries(value)) {
    if (ctx.workspaceIds.has(workspaceId)) {
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
