import { useTCopy } from '../../i18n/useTCopy';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { CustomAgentManager } from './CustomAgentManager';

export function CustomAgentSettings() {
  const { t } = useTCopy();
  return (
    <div className="adl-settings-section">
      <SettingsHeader title={t.settingsAgent} description={t.settingsAgentDesc} />
      <CustomAgentManager />
    </div>
  );
}
