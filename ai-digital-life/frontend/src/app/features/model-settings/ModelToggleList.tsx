import { useAppStore } from '@stores/slicedStore';
import { FETCH_MODELS_FAILED, FETCH_MODELS_FALLBACK } from '@stores/actions/providerActions';
import { useTCopy } from '@i18n/useTCopy';
import type { ProviderStatus } from '@shared/ipc/provider';
import type { ModelDefinition } from '@shared/ipc/provider';
import { isModelEnabled } from '../../../shared/modelUtils';
import { IconRefreshCw } from '../../icons';

interface ModelToggleListProps {
  providers: ProviderStatus[];
}

interface ModelRowProps {
  providerId: string;
  model: ModelDefinition;
  enabled: boolean;
}

function ModelRow({ providerId, model, enabled }: ModelRowProps) {
  const { t, formatT } = useTCopy();
  const toggleModel = useAppStore((s) => s.toggleModel);

  return (
    <li className={`adl-model-settings__model-row${enabled ? '' : ' is-disabled'}`}>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        className={`adl-settings-toggle${enabled ? ' is-on' : ''}`}
        title={formatT(
          t,
          enabled ? 'modelModelToggleStateEnabled' : 'modelModelToggleStateDisabled',
          { model: model.name },
        )}
        aria-label={formatT(t, 'modelModelToggleAria', { model: model.name })}
        onClick={() => void toggleModel(providerId, model.id, !enabled)}
      >
        <span className="adl-settings-toggle__track">
          <span className="adl-settings-toggle__thumb" />
        </span>
      </button>
      <span className="adl-model-settings__model-name">{model.name}</span>
      {model.description && (
        <span className="adl-model-settings__model-desc">{model.description}</span>
      )}
    </li>
  );
}

export function ModelToggleList({ providers }: ModelToggleListProps) {
  const { t, formatT } = useTCopy();
  const setAllModelsEnabled = useAppStore((s) => s.setAllModelsEnabled);
  const fetchModels = useAppStore((s) => s.fetchModels);
  const showToast = useAppStore((s) => s.showToast);
  const apiKeyInputs = useAppStore((s) => s.apiKeyInputs);
  const enabledProviders = providers.filter((p) => p.enabled);

  const handleFetchModels = async (providerId: string) => {
    const typed = apiKeyInputs[providerId]?.trim() || undefined;
    const count = await fetchModels(providerId, typed);
    if (count >= 0) {
      showToast(formatT(t, 'providerFetchModelsSuccess', { count }), 'success', 'model-fetch');
    } else if (count === FETCH_MODELS_FALLBACK) {
      showToast(t.providerFetchModelsFallback, 'warning', 'model-fetch');
    } else if (count === FETCH_MODELS_FAILED) {
      showToast(t.providerFetchModelsFailed, 'error', 'model-fetch');
    }
  };

  if (enabledProviders.length === 0) {
    return <p className="adl-model-settings__empty">{t.providerManagerNoProviders}</p>;
  }

  return (
    <div className="adl-model-settings__model-list">
      {enabledProviders.map((provider) => (
        <section
          key={provider.id}
          className="adl-model-settings__model-group"
          data-testid={`model-group-${provider.id}`}
        >
          <header className="adl-model-settings__model-group-header">
            <span className="adl-model-settings__model-group-name">{provider.name}</span>
            <button
              type="button"
              className="adl-model-settings__fetch-models-btn"
              title={t.providerManagerFetchModels}
              aria-label={t.providerManagerFetchModels}
              onClick={() => void handleFetchModels(provider.id)}
            >
              <IconRefreshCw size={12} decorative />
            </button>
            <div className="adl-model-settings__model-group-actions">
              <button
                type="button"
                className="adl-btn adl-btn--ghost adl-btn--xs"
                onClick={() => void setAllModelsEnabled(provider.id, true)}
              >
                {t.modelEnableAll}
              </button>
              <button
                type="button"
                className="adl-btn adl-btn--ghost adl-btn--xs"
                onClick={() => void setAllModelsEnabled(provider.id, false)}
              >
                {t.modelDisableAll}
              </button>
            </div>
          </header>

          {provider.models.length === 0 ? (
            <p className="adl-model-settings__model-empty">{t.modelNoModels}</p>
          ) : (
            <ul className="adl-model-settings__model-rows">
              {provider.models.map((model) => (
                <ModelRow
                  key={model.id}
                  providerId={provider.id}
                  model={model}
                  enabled={isModelEnabled(provider, model.id)}
                />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
