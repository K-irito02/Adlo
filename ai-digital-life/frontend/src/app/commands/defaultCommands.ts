import type { CopyKey } from '../i18n/types';

export type CommandGroup = 'general' | 'navigation';

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
];
