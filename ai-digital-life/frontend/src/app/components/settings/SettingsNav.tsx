import { useRef, type KeyboardEvent } from 'react';
import type { SettingsGroupId } from '@shared/ipc';
import type { CopyDict } from '../../i18n';
import { useTCopy } from '../../i18n/useTCopy';

interface SettingsNavProps {
  activeGroup: SettingsGroupId;
  onSelectGroup: (group: SettingsGroupId) => void;
}

const GROUPS: { id: SettingsGroupId; labelKey: keyof CopyDict }[] = [
  { id: 'general', labelKey: 'settingsGeneral' },
  { id: 'workspace', labelKey: 'settingsWorkspace' },
  { id: 'shortcuts', labelKey: 'settingsShortcuts' },
  { id: 'browser', labelKey: 'settingsBrowser' },
  { id: 'dsh', labelKey: 'settingsDsh' },
];

export function SettingsNav({ activeGroup, onSelectGroup }: SettingsNavProps) {
  const { t } = useTCopy();
  const navRef = useRef<HTMLElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const currentIndex = GROUPS.findIndex((g) => g.id === activeGroup);
    if (currentIndex === -1) {
      return;
    }
    let nextIndex: number | null = null;
    if (e.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % GROUPS.length;
    } else if (e.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + GROUPS.length) % GROUPS.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = GROUPS.length - 1;
    }
    if (nextIndex === null) {
      return;
    }
    e.preventDefault();
    onSelectGroup(GROUPS[nextIndex].id);
    const buttons = navRef.current?.querySelectorAll('button');
    buttons?.[nextIndex]?.focus();
  };

  return (
    <nav
      ref={navRef}
      className="adl-settings-nav"
      aria-label={t.settingsTitle}
      aria-orientation="vertical"
      onKeyDown={handleKeyDown}
    >
      <ul>
        {GROUPS.map((group) => (
          <li key={group.id}>
            <button
              type="button"
              className={`adl-settings-nav__item${activeGroup === group.id ? ' is-active' : ''}`}
              aria-current={activeGroup === group.id ? 'page' : undefined}
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
