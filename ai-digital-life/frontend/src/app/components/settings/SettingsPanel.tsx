import React, { useMemo } from 'react';
import type { SettingItem, SettingsGroupId } from '@shared/ipc';
import { useTCopy } from '../../i18n/useTCopy';
import { IconSearch, IconSettings } from '../../icons';
import { useAppStore } from '../../stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { SettingsNav } from './SettingsNav';
import { SettingsControls } from './SettingsControls';
import { KeybindSettings } from './KeybindSettings';
import { McpSettings } from '../../features/mcp/McpSettings';
import { CommandSettings } from '../../features/command-editor/CommandSettings';
import { CustomAgentSettings } from '../../features/custom-agent/CustomAgentSettings';
import { PermissionSettings } from '../../features/permission-settings/PermissionSettings';
import { ReferenceSettings } from '../../features/reference-manager/ReferenceSettings';
import { ProviderSettings } from '../../features/provider-manager/ProviderSettings';
import { LspSettings } from '../../features/lsp-panel/LspSettings';
import { getDefaultPreferences } from '../../../shared/defaultPreferences';

interface SettingsPanelProps {
  settings: SettingItem[];
  onChangeSetting: (id: string, value: string | boolean | number) => void;
}

const SETTINGS_COMPONENTS: Partial<Record<SettingsGroupId, React.ComponentType>> = {
  shortcuts: KeybindSettings,
  mcp: McpSettings,
  commands: CommandSettings,
  permissions: PermissionSettings,
  references: ReferenceSettings,
  providers: ProviderSettings,
  lsp: LspSettings,
  agent: CustomAgentSettings,
};

export function SettingsPanel({ settings, onChangeSetting }: SettingsPanelProps) {
  const { t } = useTCopy();
  const { activeGroup, setActiveGroup, searchQuery, setSearchQuery, updatePreferences, showToast } =
    useAppStore(
      useShallow((s) => ({
        activeGroup: s.activeSettingsGroup,
        setActiveGroup: s.setActiveSettingsGroup,
        searchQuery: s.settingsSearchQuery,
        setSearchQuery: s.setSettingsSearchQuery,
        updatePreferences: s.updatePreferences,
        showToast: s.showToast,
      }))
    );

  const handleResetAll = async () => {
    await updatePreferences(getDefaultPreferences());
    showToast(t.settingsResetComplete, 'success');
  };

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

  const ActiveComponent = !searchQuery.trim() ? SETTINGS_COMPONENTS[activeGroup] : undefined;

  return (
    <div className="adl-settings-panel">
      <header className="adl-settings-panel__header">
        <IconSettings size={16} decorative />
        <h3>{t.toolSettings}</h3>
        <div className="adl-settings-panel__search">
          <label htmlFor="adl-settings-search-input" className="sr-only">
            {t.settingsSearchLabel}
          </label>
          <IconSearch size={12} decorative />
          <input
            id="adl-settings-search-input"
            type="search"
            className="adl-settings-panel__search-input"
            placeholder={t.settingsSearch}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="adl-settings-reset-all"
          onClick={handleResetAll}
          aria-label={t.settingsResetAll}
        >
          {t.settingsResetAll}
        </button>
      </header>
      <div className="adl-settings-panel__body">
        {!searchQuery.trim() && (
          <SettingsNav activeGroup={activeGroup} onSelectGroup={setActiveGroup} />
        )}
        <div className="adl-settings-panel__content">
          {ActiveComponent ? (
            React.createElement(ActiveComponent)
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
