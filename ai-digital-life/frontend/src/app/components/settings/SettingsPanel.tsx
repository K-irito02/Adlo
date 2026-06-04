import React, { useMemo } from 'react';
import type { SettingsGroupId, SettingItem } from '@ai-digital-life/kernel';
import type { CopyDict } from '../../i18n';
import { IconSearch, IconSettings } from '../../icons';
import { useUiStore } from '../../stores/ui-store';
import { SettingsNav } from './SettingsNav';
import { SettingsControls } from './SettingsControls';

interface SettingsPanelProps {
  t: CopyDict;
  settings: SettingItem[];
  onChangeSetting: (id: string, value: string | boolean | number) => void;
}

export function SettingsPanel({ t, settings, onChangeSetting }: SettingsPanelProps) {
  const activeGroup = useUiStore((s) => s.activeSettingsGroup);
  const setActiveGroup = useUiStore((s) => s.setActiveSettingsGroup);
  const searchQuery = useUiStore((s) => s.settingsSearchQuery);
  const setSearchQuery = useUiStore((s) => s.setSettingsSearchQuery);

  const filtered = useMemo(() => {
    let items = settings;
    if (searchQuery.trim()) {
      const lower = searchQuery.toLowerCase();
      items = items.filter(
        (s) => s.label.toLowerCase().includes(lower) || s.description?.toLowerCase().includes(lower)
      );
    } else {
      items = items.filter((s) => s.groupId === activeGroup);
    }
    return items;
  }, [activeGroup, searchQuery, settings]);

  return (
    <div className="adl-settings-panel">
      <header className="adl-settings-panel__header">
        <IconSettings size={16} decorative />
        <h3>{t.toolSettings}</h3>
        <div className="adl-settings-panel__search">
          <IconSearch size={12} decorative />
          <input
            type="text"
            className="adl-settings-panel__search-input"
            placeholder={t.settingsSearch}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </header>
      <div className="adl-settings-panel__body">
        {!searchQuery.trim() && (
          <SettingsNav t={t} activeGroup={activeGroup} onSelectGroup={setActiveGroup} />
        )}
        <div className="adl-settings-panel__content">
          <SettingsControls
            t={t}
            items={filtered}
            onChange={onChangeSetting}
            searchQuery={searchQuery}
          />
        </div>
      </div>
    </div>
  );
}
