import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { CustomProviderDialog } from '../../components/models/CustomProviderDialog';
import { LoadingRow } from '../../components/LoadingRow';
import { IconPlus, IconSearch } from '../../icons';
import { ProviderCard } from './ProviderCard';
import { ModelToggleList } from './ModelToggleList';

const INITIAL_VISIBLE_PROVIDERS = 5;

export function ModelSettings() {
  const { t } = useTCopy();
  const providers = useAppStore((s) => s.providers);
  const isFetchingProviders = useAppStore((s) => s.isFetchingProviders);
  const fetchProviders = useAppStore((s) => s.fetchProviders);
  const [showDialog, setShowDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMoreProviders, setShowMoreProviders] = useState(false);

  useEffect(() => {
    void fetchProviders();
  }, [fetchProviders]);

  const displayProviders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      return providers.filter(
        (p) => p.name.toLowerCase().includes(query) || p.id.toLowerCase().includes(query),
      );
    }
    return showMoreProviders ? providers : providers.slice(0, INITIAL_VISIBLE_PROVIDERS);
  }, [providers, searchQuery, showMoreProviders]);

  const showMoreButton = !searchQuery.trim() && providers.length > INITIAL_VISIBLE_PROVIDERS;

  return (
    <div className="adl-settings-section adl-model-settings">
      <SettingsHeader title={t.settingsModels} description={t.settingsModelsDesc} />
      {isFetchingProviders && providers.length === 0 ? (
        <LoadingRow variant="center" />
      ) : (
        <>
          <section className="adl-model-settings__zone" aria-label={t.modelSettingsProvidersZone}>
            <div className="adl-model-settings__zone-title-row">
              <h4 className="adl-model-settings__zone-title">{t.modelSettingsProvidersZone}</h4>
              <div className="adl-model-settings__zone-controls">
                <div className="adl-model-settings__search">
                  <IconSearch size={12} decorative />
                  <input
                    type="search"
                    className="adl-model-settings__search-input"
                    placeholder={t.modelSettingsSearchProviders}
                    aria-label={t.modelSettingsSearchProviders}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="adl-btn adl-btn--ghost adl-model-settings__add-custom"
                  onClick={() => setShowDialog(true)}
                >
                  <IconPlus size={12} decorative />
                  {t.providerManagerAddCustom}
                </button>
              </div>
            </div>
            <div
              className={`adl-model-settings__provider-grid${showMoreProviders ? ' is-expanded' : ''}`}
            >
              {displayProviders.map((provider) => (
                <ProviderCard key={provider.id} provider={provider} />
              ))}
              {displayProviders.length === 0 && (
                <p className="adl-model-settings__empty">{t.providerManagerNoProviders}</p>
              )}
            </div>
            {showMoreButton && (
              <button
                type="button"
                className="adl-model-settings__more-btn"
                onClick={() => setShowMoreProviders((v) => !v)}
              >
                {showMoreProviders
                  ? t.modelSettingsCollapseProviders
                  : t.modelSettingsShowMoreProviders}
              </button>
            )}
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
