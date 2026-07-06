import { useTCopy } from '../../i18n/useTCopy';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { ReferenceList } from './ReferenceList';

export function ReferenceSettings() {
  const { t } = useTCopy();
  return (
    <div className="adl-settings-section">
      <SettingsHeader title={t.settingsReferences} description={t.settingsReferencesDesc} />
      <ReferenceList />
    </div>
  );
}
