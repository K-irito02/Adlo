import { useEffect, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { CustomProviderDialog } from '../../components/models/CustomProviderDialog';
import { LoadingRow } from '../../components/LoadingRow';
import { IconPlus } from '../../icons';
import { ProviderCard } from './ProviderCard';
import { ModelToggleList } from './ModelToggleList';

export function ModelSettings() {
  const { t } = useTCopy();
  const providers = useAppStore((s) => s.providers);
  const isFetchingProviders = useAppStore((s) => s.isFetchingProviders);
  const fetchProviders = useAppStore((s) => s.fetchProviders);
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    void fetchProviders();
  }, [fetchProviders]);

  return (
    <div className="adl-settings-section">
      <SettingsHeader
        title={t.settingsModels}
        description={t.settingsModelsDesc}
        action={
          <button
            type="button"
            className="adl-btn adl-btn--sm adl-btn--primary"
            onClick={() => setShowDialog(true)}
          >
            <IconPlus size={14} decorative />
            {t.providerManagerAddCustom}
          </button>
        }
      />
      {isFetchingProviders ? (
        <LoadingRow variant="center" />
      ) : (
        <>
          <section className="adl-model-settings__zone" aria-label={t.modelSettingsProvidersZone}>
            <h4 className="adl-model-settings__zone-title">{t.modelSettingsProvidersZone}</h4>
            <div className="adl-model-settings__provider-grid">
              {providers.map((provider) => (
                <ProviderCard key={provider.id} provider={provider} />
              ))}
              {providers.length === 0 && (
                <p className="adl-model-settings__empty">{t.providerManagerNoProviders}</p>
              )}
            </div>
          </section>
          <section
            className="adl-model-settings__zone"
            aria-label={t.modelSettingsEnabledModelsZone}
          >
            <h4 className="adl-model-settings__zone-title">{t.modelSettingsEnabledModelsZone}</h4>
            <ModelToggleList providers={providers} />
          </section>
        </>
      )}
      {showDialog && <CustomProviderDialog onClose={() => setShowDialog(false)} />}
    </div>
  );
}
