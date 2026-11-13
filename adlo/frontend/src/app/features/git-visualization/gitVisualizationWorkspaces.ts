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
