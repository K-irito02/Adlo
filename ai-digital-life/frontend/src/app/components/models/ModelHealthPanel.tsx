import React, { useState } from 'react';
import type { ModelGatewayHealthSnapshot } from '@ai-digital-life/kernel';
import { useTCopy } from '../../i18n/useTCopy';
import { IconCheckCircle, IconAlertTriangle, IconRefreshCw } from '../../icons';

interface ModelHealthPanelProps {
  modelHealth?: ModelGatewayHealthSnapshot;
  onRefresh: () => void;
  onTestConnection?: (providerId: string) => void;
}

export function ModelHealthPanel({
  modelHealth,
  onRefresh,
  onTestConnection,
}: ModelHealthPanelProps) {
  const { t } = useTCopy();
  const [testingId, setTestingId] = useState<string | null>(null);

  const providers = modelHealth?.providers ?? [];

  return (
    <div className="adl-model-health">
      <header className="adl-model-health__header">
        <h3>{t.toolModels}</h3>
        <button type="button" className="adl-btn adl-btn--ghost adl-btn--xs" onClick={onRefresh}>
          <IconRefreshCw size={12} decorative />
        </button>
      </header>
      <ul className="adl-model-health__list">
        {providers.map((provider) => (
          <li key={provider.providerId} className="adl-model-health__provider">
            <div className="adl-model-health__info">
              {provider.healthy ? (
                <IconCheckCircle size={14} decorative />
              ) : (
                <IconAlertTriangle size={14} decorative />
              )}
              <span className="adl-model-health__name">{provider.providerId}</span>
              <span
                className={`adl-chip adl-chip--xs ${provider.healthy ? 'adl-chip--success' : 'adl-chip--danger'}`}
              >
                {provider.healthy ? t.modelOnline : t.modelOffline}
              </span>
            </div>
            <p className="adl-model-health__detail">{provider.detail}</p>
            {onTestConnection && (
              <button
                type="button"
                className="adl-btn adl-btn--ghost adl-btn--xs"
                disabled={testingId === provider.providerId}
                onClick={() => {
                  setTestingId(provider.providerId);
                  onTestConnection(provider.providerId);
                  setTimeout(() => setTestingId(null), 3000);
                }}
              >
                {t.modelTestConnection}
              </button>
            )}
          </li>
        ))}
        {providers.length === 0 && <li className="adl-empty-hint">{t.noResults}</li>}
      </ul>
    </div>
  );
}
