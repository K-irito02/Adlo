import { useState } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';
import type { PermissionRule, PermissionDecision } from '@shared/ipc';

interface PermissionRulesetEditorProps {
  onClose: () => void;
}

export function PermissionRulesetEditor({ onClose }: PermissionRulesetEditorProps) {
  const { t } = useTCopy();
  const addPermissionRule = useAppStore((s) => s.addPermissionRule);

  const [pattern, setPattern] = useState('');
  const [decision, setDecision] = useState<PermissionDecision>('ask');
  const [toolType, setToolType] = useState('');
  const [always, setAlways] = useState(true);
  const [reason, setReason] = useState('');

  const handleSave = async () => {
    const rule: PermissionRule = {
      pattern,
      decision,
      tool_type: toolType,
      always,
      reason,
    };
    await addPermissionRule('', rule);
    onClose();
  };

  return (
    <div className="adl-permission-editor">
      <h3>{t.permissionRulesAdd}</h3>
      <div className="adl-form">
        <label>
          {t.permissionRulesPattern}
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="**/.env"
          />
        </label>
        <label>
          {t.permissionRulesDecision}
          <select
            value={decision}
            onChange={(e) => setDecision(e.target.value as PermissionDecision)}
          >
            <option value="allow">{t.permissionDecisionsAllow}</option>
            <option value="ask">{t.permissionDecisionsAsk}</option>
            <option value="deny">{t.permissionDecisionsDeny}</option>
          </select>
        </label>
        <label>
          {t.permissionRulesToolType}
          <input
            value={toolType}
            onChange={(e) => setToolType(e.target.value)}
            placeholder={t.permissionRulesToolTypePlaceholder}
          />
        </label>
        <label className="adl-checkbox-label">
          <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} />
          {t.permissionRulesAlways}
        </label>
        <label>
          {t.permissionRulesReason}
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t.permissionRulesReasonPlaceholder}
          />
        </label>
        <div className="adl-form-actions">
          <button className="adl-btn adl-btn--primary" onClick={handleSave}>
            {t.permissionRulesAdd}
          </button>
          <button className="adl-btn" onClick={onClose}>
            {t.permissionRulesCancel}
          </button>
        </div>
      </div>
    </div>
  );
}
