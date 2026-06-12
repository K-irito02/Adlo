import React, { useMemo } from 'react';
import type { SettingItem } from '@ai-digital-life/kernel';
import { useTCopy } from '../../i18n/useTCopy';
import { IconSearch, IconSettings } from '../../icons';
import { useAppStore } from '../../stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { SettingsNav } from './SettingsNav';
import { SettingsControls } from './SettingsControls';

interface SettingsPanelProps {
  settings: SettingItem[];
  onChangeSetting: (id: string, value: string | boolean | number) => void;
}

export function SettingsPanel({ settings, onChangeSetting }: SettingsPanelProps) {
  const { t } = useTCopy();
  const { activeGroup, setActiveGroup, searchQuery, setSearchQuery } = useAppStore(
    useShallow((s) => ({
      activeGroup: s.activeSettingsGroup,
      setActiveGroup: s.setActiveSettingsGroup,
      searchQuery: s.settingsSearchQuery,
      setSearchQuery: s.setSettingsSearchQuery,
    }))
  );

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
          <SettingsNav activeGroup={activeGroup} onSelectGroup={setActiveGroup} />
        )}
        <div className="adl-settings-panel__content">
          <SettingsControls items={filtered} onChange={onChangeSetting} searchQuery={searchQuery} />
        </div>
      </div>
    </div>
  );
}
