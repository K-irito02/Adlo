import type { RecentWorkspaceEntry } from '@shared/ipc';

/**
 * Git 可视化可见工作区：过滤掉隐藏工作区（外部文件的内存根，`removedFromSidebar`）。
 *
 * 标签栏、活动标签解析与加载相位都必须用同一份清单，否则隐藏根既会出现在标签栏，
 * 也可能被持久化的 `activeWorkspaceTab` 选中并当作 Git 工作区加载。
 */
export function visibleGitWorkspaces(workspaces: RecentWorkspaceEntry[]): RecentWorkspaceEntry[] {
  return workspaces.filter((workspace) => !workspace.removedFromSidebar);
}

/**
 * 把用户拖拽后的标签顺序与「当前可见工作区」对齐：
 * - 保留已有 id 的相对顺序；
 * - 按可见清单顺序追加新出现的工作区（新增/重新显示）；
 * - 丢弃已不存在或已隐藏的 id。
 *
 * 无变化时返回原引用，避免 useMemo / state 无谓更新。
 */
export function reconcileTabOrder(order: string[], visibleIds: string[]): string[] {
  const visible = new Set(visibleIds);
  const kept = order.filter((id) => visible.has(id));
  const keptIds = new Set(kept);
  const added = visibleIds.filter((id) => !keptIds.has(id));
  if (added.length === 0 && kept.length === order.length) {
    return order;
  }
  return [...kept, ...added];
}
