import { useEffect, useState } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';
import { ProviderConfig } from './ProviderConfig';

export function ProviderList() {
  const { t } = useTCopy();
  const providers = useAppStore((s) => s.providers);
  const isFetchingProviders = useAppStore((s) => s.isFetchingProviders);
  const fetchProviders = useAppStore((s) => s.fetchProviders);
  const clearApiKey = useAppStore((s) => s.clearApiKey);

  const [configuring, setConfiguring] = useState<string | null>(null);

  useEffect(() => {
    void fetchProviders();
  }, [fetchProviders]);

  const getProviderNameKey = (id: string): keyof typeof t => {
    const keyMap: Record<string, keyof typeof t> = {
      deepseek: 'providerDeepseek',
      minimax: 'providerMinimax',
      openai: 'providerOpenai',
      anthropic: 'providerAnthropic',
      google: 'providerGoogle',
      ollama: 'providerOllama',
      openrouter: 'providerOpenrouter',
    };
    return keyMap[id] ?? 'providerUnknown';
  };

  if (isFetchingProviders) {
    return (
      <div className="adl-provider-list">
        <h2>{t.providerTitle}</h2>
        <p className="adl-empty-state">{t.loading}</p>
      </div>
    );
  }

  return (
    <div className="adl-provider-list">
      <h2>{t.providerTitle}</h2>
      {providers.length === 0 ? (
        <p className="adl-empty-state">{t.providerNoProviders}</p>
      ) : (
        <ul className="adl-provider-items">
          {providers.map((provider) => {
            const isConfigured = provider.configured || provider.hasKey;
            const isConfiguring = configuring === provider.id;
            return (
              <li key={provider.id} className="adl-provider-item">
                <div className="adl-provider-info">
                  <span className="adl-provider-name">{t[getProviderNameKey(provider.id)]}</span>
                  <span className="adl-provider-id">{provider.id}</span>
                  <span
                    className={`adl-provider-status adl-provider-status-${isConfigured ? 'configured' : 'not-configured'}`}
                  >
                    {isConfigured ? t.providerConfigured : t.providerNotConfigured}
                  </span>
                </div>
                <div className="adl-provider-actions">
                  {isConfiguring ? (
                    <ProviderConfig
                      providerId={provider.id}
                      onCancel={() => setConfiguring(null)}
                    />
                  ) : (
                    <>
                      <button
                        type="button"
                        className="adl-provider-action-btn"
                        onClick={() => setConfiguring(provider.id)}
                      >
                        {t.providerConfigure}
                      </button>
                      {isConfigured && (
                        <button
                          type="button"
                          className="adl-provider-action-btn adl-provider-action-clear"
                          onClick={() => void clearApiKey(provider.id)}
                        >
                          {t.providerClear}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
