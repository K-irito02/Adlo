import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CommandGroup, CommandMeta } from '../../commands/defaultCommands';
import { DEFAULT_COMMANDS } from '../../commands/defaultCommands';
import { useAppStore } from '../../stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { useTCopy } from '../../i18n/useTCopy';
import {
  formatKeybind,
  EMPTY_KEYBINDS,
  parseKeybind,
  recordKeybind,
  modifierParts,
} from '../../../shared/keybinds';
import type { CopyKey } from '../../i18n/types';
import { isKeybindsAtDefault } from './settingsGroups';
import { anchorFor } from './settingsSearchIndex';
import { KeybindControl } from './KeybindControl';
import { SettingsHeader } from './SettingsHeader';
import { useKeyCapture } from '../../hooks/useKeyCapture';
import { ConfirmDialog } from '../ConfirmDialog';
import { HintCardTrigger } from '../HintCard';
import { IconResetDefaults, IconKeyboard } from '../../icons';
import { IconCircleHelp } from '../../icons/status';

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
 * 常见修饰键别名归一（control→ctrl，command/cmd→mod），覆盖 Win / Mac 显示差异。
 * 注意不用正则 lookbehind（旧 Safari 解析即 SyntaxError）：先把 `command`
 * 换成占位符再处理零散 `cmd`，避免 `commandWorkspace` 这类词被破坏
 * （标题路径另有 plain 短路，本替换只走快捷键匹配分支）。
 */
function normalizeShortcutQuery(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/,|，/g, 'comma')
    .replace(/control/g, 'ctrl')
    .replace(/command/g, 'mod')
    .replace(/cmd/g, 'mod');
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
  const [capturing, setCapturing] = useState(false);
  // 捕获态输入框回显：修饰键单按时实时预览已按下的部分（如 Ctrl+…），
  // 同时把原始部分串写入查询参与模糊过滤（压平匹配天然命中含该修饰键的命令）；
  // 落定/取消时恢复或提交。查询 untouched 的旧语义已废除。
  const [capturePreview, setCapturePreview] = useState('');
  const preCaptureQueryRef = useRef('');

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
    // 录制成功保持静默（键帽文字变化即确认），失败走冲突 toast；减少噪音是刻意产品决策。
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

  // Esc 取消与按钮/行录制的取消同语义：恢复之前查询并退出捕获态。
  const cancelCapture = useCallback(() => {
    setSearchQuery(preCaptureQueryRef.current);
    setCapturing(false);
    setCapturePreview('');
  }, []);

  // 搜索框按键捕获：与行级录制同一监听策略（document capture + 吞掉事件），
  // 避免捕获到的组合键触发全局快捷键（如 Ctrl+N 新建工作区）。
  // 修饰键单按（recordKeybind 返回 null）不结束捕获：回显已按下的部分，
  // 同时把原始部分串写入查询参与模糊过滤；Esc 取消捕获恢复之前查询。
  useEffect(() => {
    if (!capturing) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      // Esc 自身不可被捕获搜索（行级录制同样把 Esc 当停止）；
      // 打字 `esc`/`escape` 仍可命中。
      if (event.key === 'Escape') {
        cancelCapture();
        return;
      }
      const kb = recordKeybind(event);
      if (kb === null) {
        const parts = modifierParts(event);
        if (parts.length > 0) {
          setCapturePreview(`${formatKeybind(parts.join('+'))}+…`);
          setSearchQuery(parts.join('+'));
        }
        return;
      }
      setSearchQuery(formatKeybind(kb));
      setCapturing(false);
      setCapturePreview('');
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [capturing, cancelCapture]);

  const startCapture = () => {
    setActiveId(null);
    preCaptureQueryRef.current = searchQuery;
    setCapturePreview('');
    setCapturing(true);
  };

  const currentOf = (cmd: CommandMeta): string => keybinds[cmd.id] ?? cmd.defaultKeybind ?? 'none';

  const handleResetOne = (cmd: CommandMeta) => {
    const target = cmd.defaultKeybind ?? 'none';
    if (currentOf(cmd) === target) {
      return;
    }
    void (async () => {
      // 无默认值的命令重置即删 key（与 DEFAULT_KEYBINDS"缺席即默认"同构），
      // 避免存显式 'none' 造成无意义 diff。
      const next = { ...keybinds };
      if (cmd.defaultKeybind === undefined) {
        delete next[cmd.id];
      } else {
        next[cmd.id] = cmd.defaultKeybind;
      }
      const ok = await updatePreferences({ keybinds: next });
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
        if (cmd.defaultKeybind === undefined) {
          delete next[cmd.id];
        } else {
          next[cmd.id] = cmd.defaultKeybind;
        }
      }
      const ok = await updatePreferences({ keybinds: next });
      showToast(ok ? t.settingsResetComplete : t.settingsUpdateFailed, ok ? 'success' : 'error');
    })();
  };

  const pendingGroupLabel = pendingResetGroup ? t[GROUP_LABEL_KEY[pendingResetGroup]] : null;

  return (
    <div className="adl-settings-keybinds">
      <div className="adl-settings-keybinds__toolbar">
        <HintCardTrigger content={t.settingsShortcutsSearchHint}>
          <button
            type="button"
            className="adl-icon-button adl-icon-button--info"
            aria-label={t.settingsShortcutsSearchHintLabel}
          >
            <IconCircleHelp size={16} />
          </button>
        </HintCardTrigger>
        <label
          htmlFor="adl-settings-keybinds-search"
          className="adl-settings-keybinds__search-label"
        >
          {t.settingsShortcutsSearchLabel}
        </label>
        <div className="adl-settings-keybinds__search-wrap">
          <input
            id="adl-settings-keybinds-search"
            type="search"
            className="adl-settings-keybinds__search"
            placeholder={capturing ? t.settingsShortcutsSearchCapturing : ''}
            value={capturing ? capturePreview : searchQuery}
            readOnly={capturing}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button
            type="button"
            className={`adl-settings-keybinds__capture${capturing ? ' is-recording' : ''}`}
            aria-label={t.settingsShortcutsSearchByKeypress}
            title={t.settingsShortcutsSearchByKeypress}
            aria-pressed={capturing}
            onClick={() => (capturing ? cancelCapture() : startCapture())}
          >
            <IconKeyboard size={14} decorative />
          </button>
        </div>
      </div>
      {GROUP_ORDER.map((group) => {
        const list = grouped.get(group);
        if (!list || list.length === 0) {
          return null;
        }
        const groupLabel = t[GROUP_LABEL_KEY[group]];
        const groupResetLabel = formatT(t, 'settingsResetGroupToDefault', { group: groupLabel });
        // 块内全为默认值时禁用恢复按钮（同行级语义）：无 hover 灰底、不可点、不弹确认框。
        // 注意按整组判定（isKeybindsAtDefault），而非当前过滤可见的子集——搜索遮住的
        // 改动行同样参与，否则过滤态下按钮状态与重置范围不一致。
        const isGroupDefault = isKeybindsAtDefault(keybinds, group);
        return (
          <div key={group} className="adl-settings-keybinds__group">
            <div className="adl-settings-keybinds__group-header">
              <button
                type="button"
                className="adl-settings-row__reset adl-settings-keybinds__group-reset"
                aria-label={groupResetLabel}
                title={groupResetLabel}
                disabled={isGroupDefault}
                onClick={() => setPendingResetGroup(group)}
              >
                <IconResetDefaults size={14} decorative />
              </button>
              <SettingsHeader title={groupLabel} />
            </div>
            <section className="adl-settings-card">
              <ul className="adl-settings-keybinds__list">
                {list.map((cmd) => {
                  const current = currentOf(cmd);
                  const isDefault = current === (cmd.defaultKeybind ?? 'none');
                  const resetOneLabel = formatT(t, 'settingsShortcutsResetOneFor', {
                    name: t[cmd.titleKey],
                  });
                  return (
                    <li
                      key={cmd.id}
                      className="adl-settings-keybinds__row"
                      data-settings-anchor={anchorFor('shortcuts', cmd.id)}
                    >
                      <button
                        type="button"
                        className="adl-settings-row__reset adl-settings-row__reset--inline"
                        aria-label={resetOneLabel}
                        title={resetOneLabel}
                        disabled={isDefault}
                        onClick={() => handleResetOne(cmd)}
                      >
                        <IconResetDefaults size={14} decorative />
                      </button>
                      <span className="adl-settings-keybinds__label">{t[cmd.titleKey]}</span>
                      <KeybindControl
                        keybind={current}
                        isRecording={activeId === cmd.id}
                        onClick={() => {
                          if (capturing) {
                            cancelCapture();
                          }
                          setActiveId((prev) => (prev === cmd.id ? null : cmd.id));
                        }}
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
    </div>
  );
}
