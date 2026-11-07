/** 只有明确加载到「不是 Git 仓库」时才显示初始化空态；undefined/true 都不显示。 */
export function shouldShowGitInitEmptyState(snapshot: { isRepo?: boolean } | undefined): boolean {
  return snapshot?.isRepo === false;
}
