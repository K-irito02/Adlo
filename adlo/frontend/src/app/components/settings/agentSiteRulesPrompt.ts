import type { AgentSiteRulesSettingValue } from '../../../kernel/types';
import type { CopyDict } from '../../i18n';
import { formatT } from '../../i18n';

/**
 * 生成「复制给智能体的提示词」。
 *
 * 提示词不是给 Adlo 自己的，而是交给外部 Agent 工具（带内嵌浏览器 / 自动化技能）
 * 去检查真实点击行为、按 config.json 的 schema 修改配置并确认热更新生效。因此
 * 正文必须自带：配置路径、snake_case/camelCase 边界、规则匹配语义、当前快照、
 * 交付要求与失败时的诚实声明。
 */
export function buildAgentSiteRulesPrompt({
  t,
  scope,
  site,
  siteAlias,
  value,
}: {
  t: CopyDict;
  scope: 'global' | 'site';
  site: string;
  siteAlias?: string;
  value: AgentSiteRulesSettingValue;
}): string {
  const configPath = defaultConfigPath();
  const whitelistedOrigins = value.sites.map((entry) => entry.origin);
  const testTarget =
    (scope === 'site' ? site : whitelistedOrigins.join(', ')) ||
    t.settingsAgentRulesPromptTestTarget;
  const override = value.overrides.find((entry) => entry.origin === site) ?? {
    origin: site,
    disabledRuleIds: [],
    siteRules: [],
  };
  // 只给出与本次作用域相关的真实配置；总开关无法从本控件读取，正文另行要求确认为 true。
  const snapshot = {
    agent_site_whitelist: value.sites,
    agent_site_rules: value.rules,
    agent_site_overrides: scope === 'site' ? [override] : value.overrides,
  };
  const configJson = JSON.stringify(snapshot, null, 2);

  const key = scope === 'site' ? 'settingsAgentRulesPromptSite' : 'settingsAgentRulesPromptGlobal';
  return formatT(t, key, {
    configJson,
    configPath,
    site: site || t.settingsAgentRulesPromptNoSite,
    alias: siteAlias || site || t.settingsAgentRulesPromptNoAlias,
    testTarget,
  });
}

function defaultConfigPath(): string {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/Windows/i.test(userAgent)) {
    return '%APPDATA%\\com.adlo.app\\config\\config.json';
  }
  if (/Mac OS X|Macintosh/i.test(userAgent)) {
    return '~/Library/Application Support/com.adlo.app/config/config.json';
  }
  return '~/.local/share/com.adlo.app/config/config.json';
}
