import type { RecentWorkspaceEntry } from '@adlo/kernel';

/**
 * 「可见工作区」判定：变更面板与顶部工具徽章共用这一份。
 *
 * 变更面板的树/计数与顶部工具徽章必须用同一口径：用户在变更面板看得到的
 * 工作区，其变更就应计入徽章；侧栏移除（removedFromSidebar）或路径不可用
 * （available=false）的工作区在面板里不出现，也不得计入（否则徽章会出现
 * 「点进去是空的」幻数）。
 *
 * 变更面板与徽章都从这里取，禁止各自复制谓词（历史上两处数据源分叉，
 * 导致「面板有变更、徽章恒为 0」）。
 */
export function isVisibleWorkspace(workspace: RecentWorkspaceEntry): boolean {
  return !workspace.removedFromSidebar && workspace.available;
}

export function visibleWorkspacesOf(
  workspaces: readonly RecentWorkspaceEntry[] | undefined,
): RecentWorkspaceEntry[] {
  return (workspaces ?? []).filter(isVisibleWorkspace);
}
