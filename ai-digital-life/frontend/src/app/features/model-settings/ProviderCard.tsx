import { useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import type { ProviderStatus } from '@shared/ipc/provider';
import { getProviderApiKeyGuideUrl } from '@shared/modelCatalog';
import {
  IconCheckCircle,
  IconCircle,
  IconChevronDown,
  IconChevronUp,
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
  const showToast = useAppStore((s) => s.showToast);
  const connectionTestResults = useAppStore((s) => s.connectionTestResults);
  const testingProviderId = useAppStore((s) => s.testingProviderId);

  const [expanded, setExpanded] = useState(false);
  const [showKey, setShowKey] = useState(false);

  // The typed API key lives in the store (in-memory only): once entered it stays
  // in the input across re-renders / panel switches until the user clears it
  // manually, and it is used by test/fetch without requiring a prior save.
  const apiKeyInput = useAppStore((s) => s.apiKeyInputs[provider.id] ?? '');
  const setApiKeyInput = useAppStore((s) => s.setApiKeyInput);

  const connected = provider.hasKey || !provider.requiresKey;
  const isTesting = testingProviderId === provider.id;
  const result = connectionTestResults[provider.id];
  const guideUrl = getProviderApiKeyGuideUrl(provider.id);

  const handleSaveApiKey = async () => {
    // Persist the current input (overwriting any previously stored key).
    // The input value is intentionally kept — "save" must not erase it.
    const ok = await setApiKey(provider.id, apiKeyInput.trim());
    if (ok) {
      showToast(t.providerKeySaveSuccess, 'success');
    } else {
      showToast(t.providerKeySaveFailed, 'error');
    }
  };

  const handleClearApiKey = async () => {
    const ok = await clearApiKey(provider.id);
    if (ok) {
      showToast(t.providerKeyCleared, 'success');
    } else {
      showToast(t.providerKeyClearFailed, 'error');
    }
  };

  return (
    <article className="adl-provider-card" data-testid={`provider-card-${provider.id}`}>
      {/* 整卡为可点击展开区（role="button"），内嵌独立开关 <button role="switch">。
          已知 a11y 权衡：交互元素嵌套（axe 违规）。这是用户明确要求的交互
          （"整卡可点展开/折叠，仅开关组件除外"）；开关通过 stopPropagation +
          header onKeyDown 的 e.target !== e.currentTarget 守卫独立工作。 */}
      <div
        className="adl-provider-card__header"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={formatT(t, 'modelProviderDetailsAria', { provider: provider.name })}
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
            title={formatT(
              t,
              provider.enabled
                ? 'modelProviderToggleStateEnabled'
                : 'modelProviderToggleStateDisabled',
              {
                provider: provider.name,
              },
            )}
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

          {provider.requiresKey && (
            <>
              <div className="adl-provider-card__guide">
                {guideUrl && (
                  <button
                    type="button"
                    className="adl-provider-card__guide-link"
                    onClick={() => void window.digitalLife?.window?.openExternal?.(guideUrl)}
                  >
                    {t.providerApiKeyGuide}
                  </button>
                )}
                <span className="adl-provider-card__guide-hint">{t.providerApiKeyGuideHint}</span>
              </div>
              <div className="adl-provider-card__key-row">
                <div className="adl-provider-card__key-input-group">
                  <input
                    type={showKey ? 'text' : 'password'}
                    className="adl-provider-card__key-input"
                    placeholder={t.providerManagerApiKeyPlaceholder}
                    aria-label={t.providerManagerApiKey}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(provider.id, e.target.value)}
                  />
                  <button
                    type="button"
                    className="adl-provider-card__key-toggle"
                    onClick={() => setShowKey((v) => !v)}
                    aria-label={showKey ? t.providerHideKey : t.providerShowKey}
                  >
                    {showKey ? (
                      <IconEyeOff size={12} decorative />
                    ) : (
                      <IconEye size={12} decorative />
                    )}
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="adl-provider-card__actions">
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--xs"
              onClick={() => void testConnection(provider.id, apiKeyInput.trim() || undefined)}
              disabled={isTesting}
            >
              {isTesting ? t.processing : t.providerManagerTestConnection}
            </button>
            {provider.hasKey && (
              <button
                type="button"
                className="adl-btn adl-btn--ghost adl-btn--xs"
                onClick={() => void handleClearApiKey()}
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
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--xs adl-provider-card__save-btn"
              onClick={() => void handleSaveApiKey()}
              disabled={!apiKeyInput.trim()}
            >
              {t.providerManagerSaveKey}
            </button>
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
