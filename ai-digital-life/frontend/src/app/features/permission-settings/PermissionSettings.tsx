import { useState } from 'react';
import { useTCopy } from '../../i18n/useTCopy';
import { PermissionRulesetList } from './PermissionRulesetList';
import { PermissionRulesetEditor } from './PermissionRulesetEditor';

export function PermissionSettings() {
  const { t } = useTCopy();
  const [showEditor, setShowEditor] = useState(false);

  return (
    <div className="adl-settings-section">
      <div className="adl-settings-section__header">
        <h3>{t.permissionRulesCustom}</h3>
        <button
          type="button"
          className="adl-btn adl-btn--sm adl-btn--primary"
          onClick={() => setShowEditor(true)}
        >
          {t.permissionRulesAdd}
        </button>
      </div>
      <PermissionRulesetList />
      {showEditor && <PermissionRulesetEditor onClose={() => setShowEditor(false)} />}
    </div>
  );
}
