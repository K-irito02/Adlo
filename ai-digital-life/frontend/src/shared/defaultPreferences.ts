import type { AppPreferencePatch } from './ipc-types.generated';
import { DEFAULT_COMMANDS } from '../app/commands/defaultCommands';

export const DEFAULT_LANGUAGE = 'zh-CN';
export const DEFAULT_THEME_MODE = 'system' as const;
export const DEFAULT_LOG_LEVEL = 'info';
export const DEFAULT_TERMINAL_LOG_MODE = 'overwrite' as const;
export const DEFAULT_DEBUG_LOG_MODE = 'overwrite' as const;
export const DEFAULT_KEYBINDS: Record<string, string> = Object.fromEntries(
  DEFAULT_COMMANDS.filter((cmd) => cmd.defaultKeybind !== undefined).map((cmd) => [
    cmd.id,
    cmd.defaultKeybind as string,
  ])
);
export const DEFAULT_FONTS = {
  uiFont: '',
  codeFont: '',
  terminalFont: '',
};

export function getDefaultPreferences(): AppPreferencePatch {
  return {
    language: DEFAULT_LANGUAGE,
    themeMode: DEFAULT_THEME_MODE,
    logLevel: DEFAULT_LOG_LEVEL,
    terminalLogMode: DEFAULT_TERMINAL_LOG_MODE,
    debugLogMode: DEFAULT_DEBUG_LOG_MODE,
    keybinds: { ...DEFAULT_KEYBINDS },
    fonts: { ...DEFAULT_FONTS },
  };
}

export function getDefaultForSetting(id: string): string | boolean | number | undefined {
  switch (id) {
    case 'language':
      return DEFAULT_LANGUAGE;
    case 'themeMode':
      return DEFAULT_THEME_MODE;
    case 'logLevel':
      return DEFAULT_LOG_LEVEL;
    case 'terminalLogMode':
      return DEFAULT_TERMINAL_LOG_MODE;
    case 'debugLogMode':
      return DEFAULT_DEBUG_LOG_MODE;
    case 'font:ui':
    case 'font:code':
    case 'font:terminal':
      return '';
    default:
      return undefined;
  }
}
