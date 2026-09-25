import type { CopyKey } from '../i18n/types';

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
];

export function defaultKeybindOf(id: string): string | undefined {
  return DEFAULT_COMMANDS.find((cmd) => cmd.id === id)?.defaultKeybind;
}
