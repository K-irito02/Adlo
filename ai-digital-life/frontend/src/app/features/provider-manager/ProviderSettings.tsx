import { useTCopy } from '../../i18n/useTCopy';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { ProviderList } from './ProviderList';

export function ProviderSettings() {
  const { t } = useTCopy();
  return (
    <div className="adl-settings-section">
      <SettingsHeader title={t.settingsProviders} description={t.settingsProvidersDesc} />
      <ProviderList />
    </div>
  );
}
