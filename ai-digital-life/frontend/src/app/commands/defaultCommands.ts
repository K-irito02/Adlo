import type { CopyKey } from '../i18n/types';
import { formatKeybind } from '../../shared/keybinds';

export type CommandGroup = 'general' | 'navigation' | 'view' | 'zoom' | 'file';

export interface CommandMeta {
  id: string;
  titleKey: CopyKey;
  group: CommandGroup;
  defaultKeybind?: string;
}

export const DEFAULT_COMMANDS: CommandMeta[] = [
  {
    id: 'workspace.new',
    titleKey: 'commandWorkspaceNew',
    group: 'navigation',
    defaultKeybind: 'mod+n',
  },
  {
    id: 'workspace.open',
    titleKey: 'commandWorkspaceOpen',
    group: 'navigation',
    defaultKeybind: 'mod+o',
  },
  {
    id: 'settings.open',
    titleKey: 'commandSettingsOpen',
    group: 'general',
    defaultKeybind: 'mod+shift+comma',
  },
  {
    id: 'settings.shortcuts',
    titleKey: 'menuShortcuts',
    group: 'general',
  },
  { id: 'view.files', titleKey: 'menuOpenFilePanel', group: 'view', defaultKeybind: 'mod+shift+e' },
  {
    id: 'view.changes',
    titleKey: 'menuOpenChangesPanel',
    group: 'view',
    defaultKeybind: 'mod+shift+g',
  },
  {
    id: 'view.browser',
    titleKey: 'menuOpenBrowserPanel',
    group: 'view',
    defaultKeybind: 'mod+shift+b',
  },
  {
    id: 'view.terminal',
    titleKey: 'menuOpenTerminalPanel',
    group: 'view',
    defaultKeybind: 'mod+shift+`',
  },
  { id: 'zoom.in', titleKey: 'menuZoomIn', group: 'zoom', defaultKeybind: 'mod+shift+plus' },
  { id: 'zoom.out', titleKey: 'menuZoomOut', group: 'zoom', defaultKeybind: 'mod+-' },
  { id: 'zoom.reset', titleKey: 'menuResetZoom', group: 'zoom', defaultKeybind: 'mod+0' },
  {
    id: 'file.copy-relative',
    titleKey: 'fileCopyRelativePath',
    group: 'file',
    defaultKeybind: 'mod+shift+c',
  },
  {
    id: 'file.copy-full',
    titleKey: 'fileCopyFullPath',
    group: 'file',
    defaultKeybind: 'mod+alt+c',
  },
  { id: 'file.toggle-word-wrap', titleKey: 'fileWordWrap', group: 'file', defaultKeybind: 'alt+z' },
  { id: 'file.toggle-line-numbers', titleKey: 'fileLineNumbers', group: 'file' },
  { id: 'file.save', titleKey: 'fileSave', group: 'file', defaultKeybind: 'mod+s' },
];

export function defaultKeybindOf(id: string): string | undefined {
  return DEFAULT_COMMANDS.find((cmd) => cmd.id === id)?.defaultKeybind;
}

/**
 * 菜单/tooltip 展示用快捷键文本（单点）：`none` 或无绑定时返回 undefined（调用方隐藏），
 * 否则用户覆盖 ?? 命令默认 → 本地化显示。titleBarMenus / ToolSwitcher / FilesPanel 共用，防漂移。
 */
export function displayShortcut(
  keybinds: Record<string, string | undefined>,
  id: string,
): string | undefined {
  const raw = keybinds[id];
  if (raw === 'none') {
    return undefined;
  }
  return formatKeybind(raw ?? defaultKeybindOf(id) ?? 'none') || undefined;
}
