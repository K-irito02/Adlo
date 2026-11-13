/**
 * 「拦截规则」未提交草稿的本地备份键/清理工具。
 *
 * 单独成模块：面板组件文件只能导出组件（react-refresh 约束），父层
 * （行级「恢复默认」）需要在面板未挂载时清掉残留备份。
 */
export function agentSiteRulesBackupKey(itemId: string): string {
  return `adl.agent-site-rules.draft.v1.${itemId}`;
}

export function clearAgentSiteRulesDraftBackup(itemId: string): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.removeItem(agentSiteRulesBackupKey(itemId));
  } catch {
    // 清理失败不影响编辑；下次挂载的 base 校验会丢弃过期备份。
  }
}
