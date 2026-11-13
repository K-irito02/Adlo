import type { CopyDict } from '../../i18n';
import { formatT } from '../../i18n';
import type {
  AgentSiteRulesCommand,
  AgentSiteRulesSettingValue,
  SettingItem,
} from '../../../kernel/types';
import { defaultAgentSiteRules } from '../../../shared/agentSiteRules';
import { IconChevronDown } from '../../icons';

/**
 * 「拦截规则」行的摘要控件（方案 A：行内工作台）。
 *
 * 控制列只保留「有多少规则 / 多少个站点覆盖」与一个与其它设置项一致的下拉式触发器；
 * 真正的编辑器由 `AgentSiteRulesPanel` 渲染成设置行的兄弟节点，横跨整个内容宽度。
 * 旧实现 360px 弹窗塞不下 472px 的两列表单，输入框会伸出卡片外。
 */
export function AgentSiteRulesControl({
  item,
  t,
  open,
  onToggle,
}: {
  item: SettingItem;
  t: CopyDict;
  open: boolean;
  onToggle: () => void;
}) {
  const rawValue = item.value as AgentSiteRulesCommand;
  const isValue = !rawValue || !('kind' in rawValue);
  const value: AgentSiteRulesSettingValue = isValue
    ? {
        rules: (rawValue as AgentSiteRulesSettingValue).rules ?? defaultAgentSiteRules(),
        overrides: (rawValue as AgentSiteRulesSettingValue).overrides ?? [],
        sites: (rawValue as AgentSiteRulesSettingValue).sites ?? [],
      }
    : { rules: defaultAgentSiteRules(), overrides: [], sites: [] };
  const overriddenSites = value.overrides.filter(
    (entry) => entry.disabledRuleIds.length > 0 || entry.siteRules.length > 0,
  ).length;

  return (
    <div className="adl-agent-site-rules">
      <span className="adl-agent-site-rules__summary-count">
        {formatT(t, 'settingsAgentRulesSummary', {
          rules: value.rules.length,
          sites: overriddenSites,
        })}
      </span>
      <div className="adl-settings-dropdown adl-agent-site-rules__control">
        <button
          type="button"
          className="adl-settings-dropdown__trigger"
          onClick={onToggle}
          disabled={item.disabled}
          aria-expanded={open}
          aria-controls={open ? 'adl-agent-site-rules-panel' : undefined}
          aria-label={t.settingsAgentRulesEdit}
        >
          <span className="adl-settings-dropdown__value">
            {open ? t.settingsAgentRulesCollapse : t.settingsAgentRulesEdit}
          </span>
          <IconChevronDown
            size={14}
            decorative
            className={`adl-agent-site-rules__chevron${open ? ' is-open' : ''}`}
          />
        </button>
      </div>
    </div>
  );
}
