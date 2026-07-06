import { useState } from 'react';
import { useTCopy } from '../../i18n/useTCopy';
import { McpServerList } from './McpServerList';
import { McpServerConfig } from './McpServerConfig';

export function McpSettings() {
  const { t } = useTCopy();
  const [showConfig, setShowConfig] = useState(false);

  return (
    <div className="adl-settings-section">
      <div className="adl-settings-section__header">
        <h3>{t.mcpTitle}</h3>
        <button
          type="button"
          className="adl-btn adl-btn--sm adl-btn--primary"
          onClick={() => setShowConfig(true)}
        >
          {t.mcpAddServer}
        </button>
      </div>
      <McpServerList />
      {showConfig && <McpServerConfig onClose={() => setShowConfig(false)} />}
    </div>
  );
}
