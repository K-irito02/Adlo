import { useRef, type KeyboardEvent } from 'react';
import type { SettingsGroupId } from '@shared/ipc';
import { useTCopy } from '../../i18n/useTCopy';
import { SETTINGS_GROUPS } from './settingsGroups';

interface SettingsNavProps {
  activeGroup: SettingsGroupId;
  onSelectGroup: (group: SettingsGroupId) => void;
}

export function SettingsNav({ activeGroup, onSelectGroup }: SettingsNavProps) {
  const { t } = useTCopy();
  const navRef = useRef<HTMLElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const currentIndex = SETTINGS_GROUPS.findIndex((g) => g.id === activeGroup);
    if (currentIndex === -1) {
      return;
    }
    let nextIndex: number | null = null;
    if (e.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % SETTINGS_GROUPS.length;
    } else if (e.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + SETTINGS_GROUPS.length) % SETTINGS_GROUPS.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = SETTINGS_GROUPS.length - 1;
    }
    if (nextIndex === null) {
      return;
    }
    e.preventDefault();
    onSelectGroup(SETTINGS_GROUPS[nextIndex].id);
    const buttons = navRef.current?.querySelectorAll('button');
    buttons?.[nextIndex]?.focus();
  };

  return (
    // NOTE: inner nav stays unclassed — .adl-settings-nav lives on the outer
    // shell only (re-adding it here doubles padding/border).
    <nav ref={navRef} aria-label={t.settingsTitle} onKeyDown={handleKeyDown}>
      <ul>
        {SETTINGS_GROUPS.map((group) => (
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
