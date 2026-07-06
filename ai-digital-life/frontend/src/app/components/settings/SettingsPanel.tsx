import React, { useMemo } from 'react';
import type { SettingItem } from '@ai-digital-life/kernel';
import { useTCopy } from '../../i18n/useTCopy';
import { IconSearch, IconSettings } from '../../icons';
import { useAppStore } from '../../stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { SettingsNav } from './SettingsNav';
import { SettingsControls } from './SettingsControls';
import { McpSettings } from '../../features/mcp/McpSettings';
import { CommandSettings } from '../../features/command-editor/CommandSettings';
import { PermissionSettings } from '../../features/permission-settings/PermissionSettings';
import { PluginSettings } from '../../features/plugin-manager/PluginSettings';
import { ReferenceSettings } from '../../features/reference-manager/ReferenceSettings';
import { ProviderSettings } from '../../features/provider-manager/ProviderSettings';
import { LspSettings } from '../../features/lsp-panel/LspSettings';

interface SettingsPanelProps {
  settings: SettingItem[];
  onChangeSetting: (id: string, value: string | boolean | number) => void;
}

const SETTINGS_COMPONENTS: Record<string, React.ComponentType> = {
  mcp: McpSettings,
  commands: CommandSettings,
  permissions: PermissionSettings,
  plugins: PluginSettings,
  references: ReferenceSettings,
  providers: ProviderSettings,
  lsp: LspSettings,
};

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
          {!searchQuery.trim() && activeGroup in SETTINGS_COMPONENTS ? (
            React.createElement(SETTINGS_COMPONENTS[activeGroup])
          ) : (
            <SettingsControls
              items={filtered}
              onChange={onChangeSetting}
              searchQuery={searchQuery}
            />
          )}
        </div>
      </div>
    </div>
  );
}
