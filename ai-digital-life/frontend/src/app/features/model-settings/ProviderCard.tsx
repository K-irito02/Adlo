import { useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import type { ProviderStatus } from '@shared/ipc/provider';
import {
  IconCheckCircle,
  IconCircle,
  IconChevronDown,
  IconChevronUp,
  IconKey,
  IconEye,
  IconEyeOff,
  IconXCircle,
} from '../../icons';

interface ProviderCardProps {
  provider: ProviderStatus;
}

export function ProviderCard({ provider }: ProviderCardProps) {
  const { t, formatT } = useTCopy();
  const setApiKey = useAppStore((s) => s.setApiKey);
  const clearApiKey = useAppStore((s) => s.clearApiKey);
  const testConnection = useAppStore((s) => s.testConnection);
  const removeCustomProvider = useAppStore((s) => s.removeCustomProvider);
  const setProviderEnabled = useAppStore((s) => s.setProviderEnabled);
  const connectionTestResults = useAppStore((s) => s.connectionTestResults);
  const testingProviderId = useAppStore((s) => s.testingProviderId);

  const [expanded, setExpanded] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);

  const connected = provider.hasKey || !provider.requiresKey;
  const isTesting = testingProviderId === provider.id;
  const result = connectionTestResults[provider.id];

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) {
      return;
    }
    await setApiKey(provider.id, apiKeyInput.trim());
    setApiKeyInput('');
  };

  const keyInputId = `model-settings-key-${provider.id}`;

  return (
    <article className="adl-provider-card" data-testid={`provider-card-${provider.id}`}>
      <div
        className="adl-provider-card__header"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={t.modelProviderDetailsAria}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) {
            return;
          }
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
      >
        <span
          className={`adl-provider-card__status-dot${connected ? ' is-connected' : ' is-missing'}`}
        >
          {connected ? (
            <IconCheckCircle size={14} decorative />
          ) : (
            <IconCircle size={14} decorative />
          )}
        </span>
        <span className="adl-provider-card__name">{provider.name}</span>
        {expanded ? (
          <IconChevronUp size={14} decorative />
        ) : (
          <IconChevronDown size={14} decorative />
        )}
        <div className="adl-provider-card__controls">
          <button
            type="button"
            role="switch"
            aria-checked={provider.enabled}
            className={`adl-settings-toggle${provider.enabled ? ' is-on' : ''}`}
            aria-label={formatT(
              t,
              provider.enabled ? 'modelProviderDisableAria' : 'modelProviderEnableAria',
              {
                provider: provider.name,
              },
            )}
            onClick={(e) => {
              e.stopPropagation();
              void setProviderEnabled(provider.id, !provider.enabled);
            }}
          >
            <span className="adl-settings-toggle__track">
              <span className="adl-settings-toggle__thumb" />
            </span>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="adl-provider-card__body">
          <div className="adl-provider-card__info-row">
            <span className="adl-provider-card__label">{t.providerManagerBaseUrl}:</span>
            <span className="adl-provider-card__value">{provider.baseUrl ?? '—'}</span>
          </div>

          <div className="adl-provider-card__info-row">
            <span className="adl-provider-card__label">{t.providerManagerStatusNoKey}:</span>
            <span
              className={`adl-chip adl-chip--xs ${connected ? 'adl-chip--success' : 'adl-chip--danger'}`}
            >
              {connected ? t.providerManagerStatusOk : t.providerManagerStatusNoKey}
            </span>
          </div>

          {provider.requiresKey && (
            <div className="adl-provider-card__key-row">
              <label className="adl-provider-card__label" htmlFor={keyInputId}>
                <IconKey size={12} decorative />
                {t.providerManagerApiKey}
              </label>
              <div className="adl-provider-card__key-input-group">
                <input
                  id={keyInputId}
                  type={showKey ? 'text' : 'password'}
                  className="adl-provider-card__key-input"
                  placeholder={t.providerManagerApiKeyPlaceholder}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                />
                <button
                  type="button"
                  className="adl-provider-card__key-toggle"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? t.providerHideKey : t.providerShowKey}
                >
                  {showKey ? <IconEyeOff size={12} decorative /> : <IconEye size={12} decorative />}
                </button>
              </div>
            </div>
          )}

          <div className="adl-provider-card__actions">
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--xs"
              onClick={() => void handleSaveApiKey()}
              disabled={!apiKeyInput.trim()}
            >
              {t.providerManagerSaveKey}
            </button>
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--xs"
              onClick={() => void testConnection(provider.id)}
              disabled={isTesting}
            >
              {isTesting ? t.processing : t.providerManagerTestConnection}
            </button>
            {provider.hasKey && (
              <button
                type="button"
                className="adl-btn adl-btn--ghost adl-btn--xs"
                onClick={() => void clearApiKey(provider.id)}
              >
                {t.providerClear}
              </button>
            )}
            {!provider.builtIn && (
              <button
                type="button"
                className="adl-btn adl-btn--ghost adl-btn--xs adl-provider-card__remove-btn"
                onClick={() => void removeCustomProvider(provider.id)}
              >
                {t.providerManagerRemoveProvider}
              </button>
            )}
          </div>

          {result && (
            <div
              className={`adl-provider-card__test-result ${result.connected ? 'is-success' : 'is-error'}`}
            >
              {result.connected ? (
                <>
                  <IconCheckCircle size={12} decorative />
                  <span>{t.providerManagerTestSuccess}</span>
                </>
              ) : (
                <>
                  <IconXCircle size={12} decorative />
                  <span>{result.error ?? t.providerManagerTestFailed}</span>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
