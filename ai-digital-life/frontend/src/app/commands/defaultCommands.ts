import type { CopyKey } from '../i18n/types';

export type CommandGroup = 'general' | 'session' | 'navigation' | 'model' | 'terminal' | 'prompt';

export interface CommandMeta {
  id: string;
  titleKey: CopyKey;
  group: CommandGroup;
  defaultKeybind?: string;
}

export const DEFAULT_COMMANDS: CommandMeta[] = [
  {
    id: 'session.new',
    titleKey: 'commandSessionNew',
    group: 'session',
    defaultKeybind: 'mod+shift+n',
  },
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
