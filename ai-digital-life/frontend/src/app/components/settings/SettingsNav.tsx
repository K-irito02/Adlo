import React from 'react';
import type { SettingsGroupId } from '@ai-digital-life/kernel';
import type { CopyDict } from '../../i18n';
import { useTCopy } from '../../i18n/useTCopy';

interface SettingsNavProps {
  activeGroup: SettingsGroupId;
  onSelectGroup: (group: SettingsGroupId) => void;
}

const GROUPS: Array<{ id: SettingsGroupId; labelKey: keyof CopyDict }> = [
  { id: 'general', labelKey: 'settingsGeneral' },
  { id: 'model', labelKey: 'settingsModel' },
  { id: 'agent', labelKey: 'settingsAgent' },
  { id: 'workspace', labelKey: 'settingsWorkspace' },
  { id: 'shortcuts', labelKey: 'settingsShortcuts' },
];

export function SettingsNav({ activeGroup, onSelectGroup }: SettingsNavProps) {
  const { t } = useTCopy();
  return (
    <nav className="adl-settings-nav" aria-label="Settings groups">
      <ul>
        {GROUPS.map((group) => (
          <li key={group.id}>
            <button
              type="button"
              className={`adl-settings-nav__item${activeGroup === group.id ? ' is-active' : ''}`}
              onClick={() => onSelectGroup(group.id)}
            >
              {t[group.labelKey] as string}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
