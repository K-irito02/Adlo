import { useTCopy } from '../../i18n/useTCopy';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { PluginList } from './PluginList';

export function PluginSettings() {
  const { t } = useTCopy();
  return (
    <div className="adl-settings-section">
      <SettingsHeader title={t.settingsPlugins} description={t.settingsPluginsDesc} />
      <PluginList />
    </div>
  );
}
