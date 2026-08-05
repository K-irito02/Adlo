import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import type { ProviderStatus } from '@shared/ipc/provider';
import type { ModelDefinition } from '@shared/ipc/provider';
import { isModelEnabled } from '../../../shared/modelUtils';

interface ModelToggleListProps {
  providers: ProviderStatus[];
}

interface ModelRowProps {
  providerId: string;
  model: ModelDefinition;
  enabled: boolean;
  defaultModelId?: string;
}

function ModelRow({ providerId, model, enabled, defaultModelId }: ModelRowProps) {
  const { t, formatT } = useTCopy();
  const toggleModel = useAppStore((s) => s.toggleModel);
  const setDefaultModel = useAppStore((s) => s.setDefaultModel);

  const isDefault = defaultModelId === model.id;

  return (
    <li className={`adl-model-settings__model-row${enabled ? '' : ' is-disabled'}`}>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        className={`adl-settings-toggle${enabled ? ' is-on' : ''}`}
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
      {isDefault && (
        <span className="adl-chip adl-chip--xs adl-chip--info">{t.modelDefaultBadge}</span>
      )}
      <button
        type="button"
        className="adl-btn adl-btn--ghost adl-btn--xs adl-model-settings__set-default"
        onClick={() => void setDefaultModel(providerId, model.id)}
        aria-label={formatT(t, 'modelSetDefaultAria', { model: model.name })}
      >
        {t.modelSetDefault}
      </button>
    </li>
  );
}

export function ModelToggleList({ providers }: ModelToggleListProps) {
  const { t } = useTCopy();
  const updatePreferences = useAppStore((s) => s.updatePreferences);
  const setProviderEnabled = useAppStore((s) => s.setProviderEnabled);
  const modelPrefs = useAppStore((s) => s.appInfo?.config.modelPreferences.providers);

  if (providers.length === 0) {
    return <p className="adl-model-settings__empty">{t.providerManagerNoProviders}</p>;
  }

  return (
    <div className="adl-model-settings__model-list">
      {providers.map((provider) => {
        const defaultModelId = modelPrefs?.[provider.id]?.modelId;
        const allEnabled = provider.enabledModels.length === 0;
        return (
          <section
            key={provider.id}
            className="adl-model-settings__model-group"
            data-testid={`model-group-${provider.id}`}
          >
            <header className="adl-model-settings__model-group-header">
              <span className="adl-model-settings__model-group-name">{provider.name}</span>
              {!provider.enabled && (
                <span className="adl-chip adl-chip--xs adl-chip--muted">
                  {t.modelProviderDisabledHint}
                </span>
              )}
              <div className="adl-model-settings__model-group-actions">
                <button
                  type="button"
                  className="adl-btn adl-btn--ghost adl-btn--xs"
                  onClick={() =>
                    void updatePreferences({
                      modelPreferences: { [provider.id]: { enabledModels: [] } },
                    })
                  }
                >
                  {t.modelEnableAll}
                </button>
                <button
                  type="button"
                  className="adl-btn adl-btn--ghost adl-btn--xs"
                  onClick={() => void setProviderEnabled(provider.id, false)}
                >
                  {t.modelDisableAll}
                </button>
              </div>
            </header>

            {provider.models.length === 0 ? (
              <p className="adl-model-settings__model-empty">{t.modelNoModels}</p>
            ) : (
              <>
                <ul className="adl-model-settings__model-rows">
                  {provider.models.map((model) => (
                    <ModelRow
                      key={model.id}
                      providerId={provider.id}
                      model={model}
                      enabled={isModelEnabled(provider, model.id)}
                      defaultModelId={defaultModelId}
                    />
                  ))}
                </ul>
                {allEnabled && (
                  <p className="adl-model-settings__all-enabled-hint">{t.modelAllEnabledHint}</p>
                )}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
