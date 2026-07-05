import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';

export function PermissionRulesetList() {
  const { t } = useTCopy();
  const permissionConfig = useAppStore((s) => s.permissionConfig);
  const deletePermissionRule = useAppStore((s) => s.deletePermissionRule);

  if (!permissionConfig || permissionConfig.custom_rules.length === 0) {
    return <p className="adl-empty-state">{t.permissionRulesEmpty}</p>;
  }

  return (
    <ul className="adl-permission-list">
      {permissionConfig.custom_rules.map((rule, idx) => (
        <li key={idx} className="adl-permission-list__item">
          <div className="adl-permission-list__info">
            <code>{rule.pattern}</code>
            <span className={`adl-badge adl-badge--${rule.decision}`}>
              {rule.decision === 'allow'
                ? t.permissionDecisionsAllow
                : rule.decision === 'deny'
                  ? t.permissionDecisionsDeny
                  : t.permissionDecisionsAsk}
            </span>
            {rule.tool_type && <span className="adl-tag">{rule.tool_type}</span>}
          </div>
          <button
            className="adl-btn adl-btn--sm adl-btn--danger"
            onClick={() => deletePermissionRule('', idx)}
          >
            {t.permissionRulesDelete}
          </button>
        </li>
      ))}
    </ul>
  );
}
