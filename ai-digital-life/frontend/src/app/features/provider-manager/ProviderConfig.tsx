import { useState, useMemo } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';

interface ProviderConfigProps {
  providerId: string;
  onCancel: () => void;
}

export function ProviderConfig({ providerId, onCancel }: ProviderConfigProps) {
  const { t } = useTCopy();
  const setApiKey = useAppStore((s) => s.setApiKey);
  const providers = useAppStore((s) => s.providers);
  const configuredProviders = useMemo(
    () => providers.filter((p) => p.configured || p.hasKey).map((p) => p.id),
    [providers],
  );
  const [apiKey, setApiKeyLocal] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const isConfigured = configuredProviders.includes(providerId);

  const handleSave = async () => {
    if (!apiKey.trim()) {
      return;
    }
    setSaving(true);
    await setApiKey(providerId, apiKey.trim());
    setSaving(false);
    onCancel();
  };

  return (
    <div className="adl-provider-config">
      {isConfigured && <p className="adl-provider-config-status">{t.providerConfigured}</p>}
      <div className="adl-provider-config-field">
        <label htmlFor={`api-key-${providerId}`}>{t.providerApiKey}</label>
        <div className="adl-provider-config-input-row">
          <input
            id={`api-key-${providerId}`}
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKeyLocal(e.target.value)}
            placeholder={t.providerConfigureApiKey}
            className="adl-provider-config-input"
          />
          <button
            type="button"
            className="adl-provider-config-toggle"
            onClick={() => setShowKey(!showKey)}
            aria-label={showKey ? t.providerHideKey : t.providerShowKey}
          >
            {showKey ? t.providerHideKey : t.providerShowKey}
          </button>
        </div>
      </div>
      <div className="adl-provider-config-actions">
        <button
          type="button"
          className="adl-provider-config-btn adl-provider-config-btn-save"
          onClick={() => void handleSave()}
          disabled={!apiKey.trim() || saving}
        >
          {saving ? t.processing : t.providerSave}
        </button>
        <button
          type="button"
          className="adl-provider-config-btn adl-provider-config-btn-cancel"
          onClick={onCancel}
        >
          {t.providerCancel}
        </button>
      </div>
    </div>
  );
}
