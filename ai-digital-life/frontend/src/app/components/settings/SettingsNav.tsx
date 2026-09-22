import { useRef, type KeyboardEvent } from 'react';
import type { SettingsGroupId } from '@shared/ipc';
import { useTCopy } from '../../i18n/useTCopy';
import { formatT } from '../../i18n/formatT';
import { IconResetDefaults } from '../../icons';
import { SETTINGS_GROUPS } from './settingsGroups';

interface SettingsNavProps {
  activeGroup: SettingsGroupId;
  onSelectGroup: (group: SettingsGroupId) => void;
  /** 组级重置：仅已接入默认映射的组渲染按钮（当前为 general）。 */
  resettableGroups?: ReadonlySet<SettingsGroupId>;
  onResetGroup?: (group: SettingsGroupId) => void;
}

export function SettingsNav({
  activeGroup,
  onSelectGroup,
  resettableGroups,
  onResetGroup,
}: SettingsNavProps) {
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
    const buttons = navRef.current?.querySelectorAll('.adl-settings-nav__item');
    (buttons?.[nextIndex] as HTMLElement | undefined)?.focus();
  };

  return (
    // NOTE: inner nav stays unclassed — .adl-settings-nav lives on the outer
    // shell only (re-adding it here doubles padding/border).
    <nav ref={navRef} aria-label={t.settingsTitle} onKeyDown={handleKeyDown}>
      <ul>
        {SETTINGS_GROUPS.map((group) => {
          const groupLabel = t[group.labelKey] as string;
          const canResetGroup = resettableGroups?.has(group.id) ?? false;
          const resetLabel = formatT(t, 'settingsResetGroupToDefault', { group: groupLabel });
          return (
            <li
              key={group.id}
              className={`adl-settings-nav__row${activeGroup === group.id ? ' is-active' : ''}`}
            >
              <button
                type="button"
                className={`adl-settings-nav__item${activeGroup === group.id ? ' is-active' : ''}`}
                aria-current={activeGroup === group.id ? 'page' : undefined}
                onClick={() => onSelectGroup(group.id)}
              >
                {groupLabel}
              </button>
              {canResetGroup && (
                <button
                  type="button"
                  className="adl-settings-row__reset adl-settings-nav__reset"
                  aria-label={resetLabel}
                  title={resetLabel}
                  onClick={(e) => {
                    e.stopPropagation();
                    onResetGroup?.(group.id);
                  }}
                >
                  <IconResetDefaults size={14} decorative />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
