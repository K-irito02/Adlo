import { useMemo, useState } from 'react';
import type { CommandGroup, CommandMeta } from '../../commands/defaultCommands';
import { useCommandRegistry } from '../../commands/useCommandRegistry';
import { useAppStore } from '../../stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { useTCopy } from '../../i18n/useTCopy';
import { formatKeybind, EMPTY_KEYBINDS } from '../../../shared/keybinds';
import type { CopyKey } from '../../i18n/types';
import { KeybindControl } from './KeybindControl';
import { useKeyCapture } from '../../hooks/useKeyCapture';

const GROUP_ORDER: CommandGroup[] = [
  'general',
  'session',
  'navigation',
  'model',
  'terminal',
  'prompt',
];

const GROUP_LABEL_KEY: Record<CommandGroup, CopyKey> = {
  general: 'settingsShortcutsGroupGeneral',
  session: 'settingsShortcutsGroupSession',
  navigation: 'settingsShortcutsGroupNavigation',
  model: 'settingsShortcutsGroupModel',
  terminal: 'settingsShortcutsGroupTerminal',
  prompt: 'settingsShortcutsGroupPrompt',
};

export function KeybindSettings() {
  const { t, formatT } = useTCopy();
  const commands = useCommandRegistry();
  const { keybinds, updatePreferences, showToast } = useAppStore(
    useShallow((s) => ({
      keybinds: s.appInfo?.config?.keybinds ?? EMPTY_KEYBINDS,
      updatePreferences: s.updatePreferences,
      showToast: s.showToast,
    })),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) {
      return commands;
    }
    const lower = searchQuery.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.id.toLowerCase().includes(lower) || t[cmd.titleKey].toLowerCase().includes(lower),
    );
  }, [commands, searchQuery, t]);

  const grouped = useMemo(() => {
    const map = new Map<CommandGroup, CommandMeta[]>();
    for (const group of GROUP_ORDER) {
      map.set(group, []);
    }
    for (const cmd of filtered) {
      const list = map.get(cmd.group);
      if (list) {
        list.push(cmd);
      }
    }
    return map;
  }, [filtered]);

  const handleRecord = (id: string, keybind: string) => {
    void updatePreferences({ keybinds: { ...keybinds, [id]: keybind } });
    setActiveId(null);
  };

  const handleConflict = (id: string, keybind: string, conflicts: CommandMeta[]) => {
    const keybindDisplay = formatKeybind(keybind);
    const titles = conflicts.map((c) => t[c.titleKey]).join(', ');
    showToast(
      formatT(t, 'settingsShortcutsConflictDesc', { keybind: keybindDisplay, titles }),
      'warning',
    );
    setActiveId(null);
  };

  const handleStop = () => {
    setActiveId(null);
  };

  useKeyCapture({
    activeId,
    commands,
    keybinds,
    onRecord: handleRecord,
    onConflict: handleConflict,
    onStop: handleStop,
  });

  return (
    <div className="adl-settings-keybinds">
      <div className="adl-settings-keybinds__header">
        <h3>{t.settingsShortcutsTitle}</h3>
        <input
          type="search"
          className="adl-settings-keybinds__search"
          placeholder={t.settingsShortcutsSearch}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      {GROUP_ORDER.map((group) => {
        const list = grouped.get(group);
        if (!list || list.length === 0) {
          return null;
        }
        return (
          <section key={group} className="adl-settings-keybinds__group">
            <h4 className="adl-settings-keybinds__group-title">{t[GROUP_LABEL_KEY[group]]}</h4>
            <ul className="adl-settings-keybinds__list">
              {list.map((cmd) => {
                const current = keybinds[cmd.id] ?? cmd.defaultKeybind;
                return (
                  <li key={cmd.id} className="adl-settings-keybinds__row">
                    <span className="adl-settings-keybinds__label">{t[cmd.titleKey]}</span>
                    <KeybindControl
                      keybind={current}
                      isRecording={activeId === cmd.id}
                      onClick={() => setActiveId((prev) => (prev === cmd.id ? null : cmd.id))}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
