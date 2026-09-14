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
  ]),
);
export const DEFAULT_FONTS = {
  uiFont: '',
  codeFont: '',
  terminalFont: '',
};

export const DEFAULT_MAX_CONCURRENT_WORKSPACES = 6;
export const DEFAULT_WORKSPACE_PRIORITY_IDS: string[] = [];
export const DEFAULT_WORKSPACE_DEFERRED_IDS: string[] = [];
export const DEFAULT_WORKSPACE_NATURAL_ORDER: string[] = [];

// 与 app/features/terminal/terminalHistoryBudget.ts 的 TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES
// 是同一默认值，但 shared/ 不能 import app/features/，故在此重复定义。
// 改动默认值时两处必须同步。
export const DEFAULT_TERMINAL_HISTORY_BUDGET_BYTES = 1 << 30;

export function getDefaultPreferences(): AppPreferencePatch {
  return {
    language: DEFAULT_LANGUAGE,
    themeMode: DEFAULT_THEME_MODE,
    logLevel: DEFAULT_LOG_LEVEL,
    terminalLogMode: DEFAULT_TERMINAL_LOG_MODE,
    debugLogMode: DEFAULT_DEBUG_LOG_MODE,
    keybinds: { ...DEFAULT_KEYBINDS },
    fonts: { ...DEFAULT_FONTS },
    maxConcurrentWorkspaces: DEFAULT_MAX_CONCURRENT_WORKSPACES,
    workspacePriorityIds: [...DEFAULT_WORKSPACE_PRIORITY_IDS],
    workspaceDeferredIds: [...DEFAULT_WORKSPACE_DEFERRED_IDS],
    workspaceNaturalOrder: [...DEFAULT_WORKSPACE_NATURAL_ORDER],
    terminalHistoryBudgetBytes: DEFAULT_TERMINAL_HISTORY_BUDGET_BYTES,
  };
}

export function getDefaultForSetting(id: string): string | boolean | number | string[] | undefined {
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
    case 'maxConcurrentWorkspaces':
      return DEFAULT_MAX_CONCURRENT_WORKSPACES;
    case 'workspacePriorityIds':
      return DEFAULT_WORKSPACE_PRIORITY_IDS;
    case 'workspaceDeferredIds':
      return DEFAULT_WORKSPACE_DEFERRED_IDS;
    case 'workspaceNaturalOrder':
      return DEFAULT_WORKSPACE_NATURAL_ORDER;
    case 'terminalHistoryBudgetBytes':
      return DEFAULT_TERMINAL_HISTORY_BUDGET_BYTES;
    case 'font:ui':
    case 'font:code':
    case 'font:terminal':
      return '';
    default:
      return undefined;
  }
}
