import React, { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { useTCopy } from '../../i18n/useTCopy';
import {
  IconPlus,
  IconRefreshCw,
  IconCheckCircle,
  IconXCircle,
  IconCircle,
  IconKey,
  IconEye,
  IconEyeOff,
} from '../../icons';
import { CustomProviderDialog } from './CustomProviderDialog';

interface ExpandedProvider {
  providerId: string;
  apiKeyInput: string;
  showKey: boolean;
}

export function ProviderManager() {
  const { t } = useTCopy();
  const providers = useAppStore(useShallow((s) => s.providers));
  const isFetchingProviders = useAppStore(useShallow((s) => s.isFetchingProviders));
  const connectionTestResults = useAppStore(useShallow((s) => s.connectionTestResults));
  const testingProviderId = useAppStore(useShallow((s) => s.testingProviderId));
  const fetchProviders = useAppStore((s) => s.fetchProviders);
  const setApiKey = useAppStore((s) => s.setApiKey);
  const clearApiKey = useAppStore((s) => s.clearApiKey);
  const testConnection = useAppStore((s) => s.testConnection);
  const removeCustomProvider = useAppStore((s) => s.removeCustomProvider);
  const fetchModels = useAppStore((s) => s.fetchModels);

  const [expanded, setExpanded] = useState<Record<string, ExpandedProvider>>({});
  const [showDialog, setShowDialog] = useState(false);
  const [fetchingModelsId, setFetchingModelsId] = useState<string | null>(null);

  useEffect(() => {
    void fetchProviders();
  }, [fetchProviders]);

  const toggleExpand = useCallback((providerId: string) => {
    setExpanded((prev) => {
      if (prev[providerId]) {
        const next = { ...prev };
        delete next[providerId];
        return next;
      }
      return {
        ...prev,
        [providerId]: {
          providerId,
          apiKeyInput: '',
          showKey: false,
        },
      };
    });
  }, []);

  const handleApiKeyChange = useCallback((providerId: string, value: string) => {
    setExpanded((prev) => ({
      ...prev,
      [providerId]: { ...prev[providerId], apiKeyInput: value },
    }));
  }, []);

  const handleSaveApiKey = useCallback(
    async (providerId: string) => {
      const input = expanded[providerId]?.apiKeyInput;
      if (!input) {
        return;
      }
      await setApiKey(providerId, input);
      setExpanded((prev) => ({
        ...prev,
        [providerId]: { ...prev[providerId], apiKeyInput: '' },
      }));
    },
    [expanded, setApiKey]
  );

  const handleClearApiKey = useCallback(
    async (providerId: string) => {
      await clearApiKey(providerId);
    },
    [clearApiKey]
  );

  const handleTestConnection = useCallback(
    async (providerId: string) => {
      await testConnection(providerId);
    },
    [testConnection]
  );

  const handleFetchModels = useCallback(
    async (providerId: string) => {
      setFetchingModelsId(providerId);
      await fetchModels(providerId);
      setFetchingModelsId(null);
    },
    [fetchModels]
  );

  const handleRemoveCustomProvider = useCallback(
    async (providerId: string) => {
      await removeCustomProvider(providerId);
    },
    [removeCustomProvider]
  );

  const testResult = (providerId: string) => connectionTestResults[providerId];

  return (
    <div className="adl-provider-manager">
      <header className="adl-provider-manager__header">
        <h3>{t.providerManagerTitle}</h3>
        <div className="adl-provider-manager__header-actions">
          <button
            type="button"
            className="adl-btn adl-btn--ghost adl-btn--xs"
            onClick={() => void fetchProviders()}
            disabled={isFetchingProviders}
            aria-label="Refresh providers"
          >
            <IconRefreshCw size={12} decorative className={isFetchingProviders ? 'adl-spin' : ''} />
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--ghost adl-btn--xs"
            onClick={() => setShowDialog(true)}
            aria-label={t.providerManagerAddCustom}
          >
            <IconPlus size={12} decorative />
          </button>
        </div>
      </header>

      <ul className="adl-provider-manager__list">
        {providers.map((provider) => {
          const isExpanded = !!expanded[provider.providerId];
          const result = testResult(provider.providerId);
          const isTesting = testingProviderId === provider.providerId;
          const isFetchingModels = fetchingModelsId === provider.providerId;

          return (
            <li
              key={provider.providerId}
              className={`adl-provider-manager__item${isExpanded ? ' is-expanded' : ''}`}
            >
              <button
                type="button"
                className="adl-provider-manager__item-header"
                onClick={() => toggleExpand(provider.providerId)}
              >
                <span className="adl-provider-manager__status-dot">
                  {provider.hasKey || !provider.requiresKey ? (
                    <IconCheckCircle size={12} decorative />
                  ) : (
                    <IconCircle size={12} decorative />
                  )}
                </span>
                <span className="adl-provider-manager__item-name">{provider.name}</span>
                <span className="adl-provider-manager__item-meta">
                  {provider.builtIn ? (
                    <span className="adl-chip adl-chip--xs adl-chip--muted">
                      {t.providerManagerBuiltIn}
                    </span>
                  ) : (
                    <span className="adl-chip adl-chip--xs adl-chip--info">
                      {t.providerManagerCustom}
                    </span>
                  )}
                </span>
              </button>

              {isExpanded && (
                <div className="adl-provider-manager__item-body">
                  <div className="adl-provider-manager__info-row">
                    <span className="adl-provider-manager__label">{t.providerManagerBaseUrl}:</span>
                    <span className="adl-provider-manager__value">{provider.baseUrl ?? '—'}</span>
                  </div>

                  <div className="adl-provider-manager__info-row">
                    <span className="adl-provider-manager__label">
                      {t.providerManagerStatusNoKey}:
                    </span>
                    <span
                      className={`adl-chip adl-chip--xs ${provider.hasKey || !provider.requiresKey ? 'adl-chip--success' : 'adl-chip--danger'}`}
                    >
                      {provider.hasKey || !provider.requiresKey
                        ? t.providerManagerStatusOk
                        : t.providerManagerStatusNoKey}
                    </span>
                  </div>

                  {provider.requiresKey && (
                    <div className="adl-provider-manager__key-row">
                      <label className="adl-provider-manager__label">
                        <IconKey size={12} decorative />
                        {t.providerManagerApiKey}
                      </label>
                      <div className="adl-provider-manager__key-input-group">
                        <input
                          type={expanded[provider.providerId]?.showKey ? 'text' : 'password'}
                          className="adl-provider-manager__key-input"
                          placeholder={t.providerManagerApiKeyPlaceholder}
                          value={expanded[provider.providerId]?.apiKeyInput ?? ''}
                          onChange={(e) => handleApiKeyChange(provider.providerId, e.target.value)}
                        />
                        <button
                          type="button"
                          className="adl-btn adl-btn--ghost adl-btn--xs"
                          onClick={() =>
                            setExpanded((prev) => ({
                              ...prev,
                              [provider.providerId]: {
                                ...prev[provider.providerId],
                                showKey: !prev[provider.providerId]?.showKey,
                              },
                            }))
                          }
                          aria-label={expanded[provider.providerId]?.showKey ? 'Hide' : 'Show'}
                        >
                          {expanded[provider.providerId]?.showKey ? (
                            <IconEyeOff size={12} decorative />
                          ) : (
                            <IconEye size={12} decorative />
                          )}
                        </button>
                      </div>
                      <div className="adl-provider-manager__key-actions">
                        <button
                          type="button"
                          className="adl-btn adl-btn--ghost adl-btn--xs"
                          onClick={() => handleSaveApiKey(provider.providerId)}
                          disabled={!expanded[provider.providerId]?.apiKeyInput}
                        >
                          {t.providerManagerSaveKey}
                        </button>
                        {provider.hasKey && (
                          <button
                            type="button"
                            className="adl-btn adl-btn--ghost adl-btn--xs"
                            onClick={() => handleClearApiKey(provider.providerId)}
                          >
                            {t.providerClear}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="adl-provider-manager__actions">
                    <button
                      type="button"
                      className="adl-btn adl-btn--ghost adl-btn--xs"
                      onClick={() => handleTestConnection(provider.providerId)}
                      disabled={isTesting}
                    >
                      {isTesting ? '...' : t.providerManagerTestConnection}
                    </button>
                    <button
                      type="button"
                      className="adl-btn adl-btn--ghost adl-btn--xs"
                      onClick={() => handleFetchModels(provider.providerId)}
                      disabled={isFetchingModels}
                    >
                      <IconRefreshCw
                        size={10}
                        decorative
                        className={isFetchingModels ? 'adl-spin' : ''}
                      />
                      {t.providerManagerFetchModels}
                    </button>
                    {!provider.builtIn && (
                      <button
                        type="button"
                        className="adl-btn adl-btn--ghost adl-btn--xs adl-provider-manager__remove-btn"
                        onClick={() => handleRemoveCustomProvider(provider.providerId)}
                      >
                        {t.providerManagerRemoveProvider}
                      </button>
                    )}
                  </div>

                  {result && (
                    <div
                      className={`adl-provider-manager__test-result ${result.connected ? 'is-success' : 'is-error'}`}
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

                  {provider.models.length > 0 && (
                    <div className="adl-provider-manager__models">
                      <span className="adl-provider-manager__models-label">{t.models}:</span>
                      <ul className="adl-provider-manager__model-list">
                        {provider.models.map((model) => (
                          <li key={model.id} className="adl-provider-manager__model-item">
                            <span className="adl-provider-manager__model-name">{model.name}</span>
                            {model.description && (
                              <span className="adl-provider-manager__model-desc">
                                {model.description}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {providers.length === 0 && !isFetchingProviders && (
          <li className="adl-provider-manager__empty">{t.providerManagerNoProviders}</li>
        )}
      </ul>

      <button
        type="button"
        className="adl-provider-manager__add-btn"
        onClick={() => setShowDialog(true)}
      >
        <IconPlus size={14} decorative />
        {t.providerManagerAddCustom}
      </button>

      {showDialog && <CustomProviderDialog onClose={() => setShowDialog(false)} />}
    </div>
  );
}
