import { useMemo, useState } from 'react';
import type { CommandGroup, CommandMeta } from '../../commands/defaultCommands';
import { DEFAULT_COMMANDS } from '../../commands/defaultCommands';
import { useAppStore } from '../../stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { useTCopy } from '../../i18n/useTCopy';
import { formatKeybind, EMPTY_KEYBINDS, parseKeybind } from '../../../shared/keybinds';
import { DEFAULT_KEYBINDS } from '../../../shared/defaultPreferences';
import type { CopyKey } from '../../i18n/types';
import { KeybindControl } from './KeybindControl';
import { useKeyCapture } from '../../hooks/useKeyCapture';
import { ConfirmDialog } from '../ConfirmDialog';
import { IconResetDefaults } from '../../icons';

const GROUP_ORDER: CommandGroup[] = ['general', 'navigation', 'view', 'zoom', 'file'];

const GROUP_LABEL_KEY: Record<CommandGroup, CopyKey> = {
  general: 'settingsShortcutsGroupGeneral',
  navigation: 'settingsShortcutsGroupNavigation',
  view: 'settingsShortcutsGroupView',
  zoom: 'settingsShortcutsGroupZoom',
  file: 'settingsShortcutsGroupFile',
};

/**
 * 查询串归一化：小写、去空白；`, / ，` 统一为 `comma`（与 keybind 存储一致）；
 * 常见修饰键别名归一（control→ctrl，cmd/command→mod），覆盖 Win / Mac 显示差异。
 */
function normalizeShortcutQuery(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/,|，/g, 'comma')
    .replace(/control/g, 'ctrl')
    .replace(/command/g, 'mod')
    .replace(/(?<!mo)cmd/g, 'mod');
}

/** 命令的三路可匹配文本：原始串（mod+n）/ 格式化显示（Ctrl+N）/ 去 `+` 压平（modn，命中单键名）。 */
function shortcutMatchTexts(
  cmd: CommandMeta,
  keybinds: Record<string, string | undefined>,
): string[] {
  const raw = (keybinds[cmd.id] ?? cmd.defaultKeybind ?? 'none').toLowerCase();
  const formatted = formatKeybind(keybinds[cmd.id] ?? cmd.defaultKeybind).toLowerCase();
  const tokens = parseKeybind(raw).join('');
  return [raw, formatted, tokens];
}

function matchesShortcutQuery(
  cmd: CommandMeta,
  keybinds: Record<string, string | undefined>,
  title: string,
  query: string,
): boolean {
  const plain = query.trim().toLowerCase().replace(/\s+/g, '');
  if (!plain) {
    return true;
  }
  // 标题 / id 匹配：只做大小写+空白归一，不做快捷键别名替换
  //（别名替换会把 `commandWorkspace` 之类的标题查询破坏成 `modworkspace`）。
  if (
    cmd.id.toLowerCase().includes(plain) ||
    title.toLowerCase().replace(/\s+/g, '').includes(plain)
  ) {
    return true;
  }
  // 快捷键匹配：原始串 / 格式化显示 / 去 `+` 压平均可命中。
  const q = normalizeShortcutQuery(query);
  const qFlat = q.replace(/\+/g, '');
  return shortcutMatchTexts(cmd, keybinds).some((text) => {
    const flat = text.replace(/\+/g, '');
    return text.includes(q) || flat.includes(qFlat);
  });
}

export function KeybindSettings() {
  const { t, formatT } = useTCopy();
  const commands = DEFAULT_COMMANDS;
  const { keybinds, updatePreferences, showToast } = useAppStore(
    useShallow((s) => ({
      keybinds: s.appInfo?.config?.keybinds ?? EMPTY_KEYBINDS,
      updatePreferences: s.updatePreferences,
      showToast: s.showToast,
    })),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingResetGroup, setPendingResetGroup] = useState<CommandGroup | null>(null);
  const [confirmResetAllOpen, setConfirmResetAllOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) {
      return commands;
    }
    return commands.filter((cmd) =>
      matchesShortcutQuery(cmd, keybinds, t[cmd.titleKey], searchQuery),
    );
  }, [commands, keybinds, searchQuery, t]);

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

  const currentOf = (cmd: CommandMeta): string => keybinds[cmd.id] ?? cmd.defaultKeybind ?? 'none';

  const handleResetOne = (cmd: CommandMeta) => {
    const target = cmd.defaultKeybind ?? 'none';
    if (currentOf(cmd) === target) {
      return;
    }
    void (async () => {
      const ok = await updatePreferences({ keybinds: { ...keybinds, [cmd.id]: target } });
      showToast(ok ? t.settingsResetComplete : t.settingsUpdateFailed, ok ? 'success' : 'error');
    })();
  };

  const handleConfirmGroupReset = () => {
    if (!pendingResetGroup) {
      return;
    }
    const group = pendingResetGroup;
    setPendingResetGroup(null);
    void (async () => {
      const next = { ...keybinds };
      for (const cmd of commands.filter((c) => c.group === group)) {
        next[cmd.id] = cmd.defaultKeybind ?? 'none';
      }
      const ok = await updatePreferences({ keybinds: next });
      showToast(ok ? t.settingsResetComplete : t.settingsUpdateFailed, ok ? 'success' : 'error');
    })();
  };

  const handleConfirmResetAll = () => {
    setConfirmResetAllOpen(false);
    void (async () => {
      const ok = await updatePreferences({ keybinds: { ...keybinds, ...DEFAULT_KEYBINDS } });
      showToast(ok ? t.settingsResetComplete : t.settingsUpdateFailed, ok ? 'success' : 'error');
    })();
  };

  const pendingGroupLabel = pendingResetGroup ? t[GROUP_LABEL_KEY[pendingResetGroup]] : null;

  return (
    <div className="adl-settings-keybinds">
      <div className="adl-settings-keybinds__toolbar">
        <button
          type="button"
          className="adl-settings-row__reset"
          aria-label={t.settingsShortcutsResetAllShortcuts}
          title={t.settingsShortcutsResetAllShortcuts}
          onClick={() => setConfirmResetAllOpen(true)}
        >
          <IconResetDefaults size={14} decorative />
        </button>
        <label
          htmlFor="adl-settings-keybinds-search"
          className="adl-settings-keybinds__search-label"
        >
          {t.settingsShortcutsSearchLabel}
        </label>
        <input
          id="adl-settings-keybinds-search"
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
        const groupLabel = t[GROUP_LABEL_KEY[group]];
        const groupResetLabel = formatT(t, 'settingsResetGroupToDefault', { group: groupLabel });
        return (
          <div key={group} className="adl-settings-keybinds__group">
            <div className="adl-settings-keybinds__group-header">
              <button
                type="button"
                className="adl-settings-row__reset adl-settings-keybinds__group-reset"
                aria-label={groupResetLabel}
                title={groupResetLabel}
                onClick={() => setPendingResetGroup(group)}
              >
                <IconResetDefaults size={14} decorative />
              </button>
              <h4 className="adl-settings-keybinds__group-title">{groupLabel}</h4>
            </div>
            <section className="adl-settings-card">
              <ul className="adl-settings-keybinds__list">
                {list.map((cmd) => {
                  const current = currentOf(cmd);
                  const isDefault = current === (cmd.defaultKeybind ?? 'none');
                  return (
                    <li key={cmd.id} className="adl-settings-keybinds__row">
                      <button
                        type="button"
                        className="adl-settings-row__reset adl-settings-row__reset--inline"
                        aria-label={t.settingsShortcutsResetOne}
                        title={t.settingsShortcutsResetOne}
                        disabled={isDefault}
                        onClick={() => handleResetOne(cmd)}
                      >
                        <IconResetDefaults size={14} decorative />
                      </button>
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
          </div>
        );
      })}
      <ConfirmDialog
        open={pendingResetGroup !== null}
        title={
          pendingGroupLabel
            ? formatT(t, 'settingsResetGroupConfirmTitle', { group: pendingGroupLabel })
            : ''
        }
        message={
          pendingGroupLabel
            ? formatT(t, 'settingsResetGroupConfirmMessage', { group: pendingGroupLabel })
            : ''
        }
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        onConfirm={handleConfirmGroupReset}
        onCancel={() => setPendingResetGroup(null)}
      />
      <ConfirmDialog
        open={confirmResetAllOpen}
        title={t.settingsShortcutsResetAllTitle}
        message={t.settingsShortcutsResetAllMessage}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        onConfirm={handleConfirmResetAll}
        onCancel={() => setConfirmResetAllOpen(false)}
      />
    </div>
  );
}
