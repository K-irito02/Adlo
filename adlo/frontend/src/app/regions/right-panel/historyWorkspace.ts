import type { RecentWorkspaceEntry } from '@adlo/kernel';

/**
 * 文件历史（后退/前进）条目的落点解析。
 *
 * 外部文件的隐藏条目会被工作区列表刷新整体替换，但根仍在 `externalFileRoots`；
 * 只看 `recentWorkspaces` 会把外部路径当成当前工作区的相对路径重开（内容错误）。
 */
export function resolveHistoryWorkspace(
  entry: { path: string; workspaceId: string | undefined },
  recentWorkspaces: RecentWorkspaceEntry[],
  externalFileRoots: Record<string, string>,
): { id: string; root: string } | null {
  const workspaceId = entry.workspaceId;
  if (!workspaceId) {
    return null;
  }
  const workspace = recentWorkspaces.find((item) => item.id === workspaceId);
  const root =
    workspace?.rootPath ?? workspace?.path ?? externalFileRoots[workspaceId] ?? undefined;
  return root ? { id: workspaceId, root } : null;
}
