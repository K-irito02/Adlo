import type { AppPreferencePatch } from './ipc-types.generated';
import { DEFAULT_COMMANDS } from '../app/commands/defaultCommands';

/**
 * 语言默认值 = 「跟随系统」（产品决策 2026-09-27）：
 * - `system` 表示持续跟随操作系统语言（解析见 `i18n/resolveLanguage.ts`：zh* → zh-CN，其余 → en-US）。
 * - 用户在设置中手动选定具体语言后，该值即成为个人默认基线 —— 组级/全部恢复
 *   默认**不包含** language/themeMode（见 `GROUP_RESET_PATCHES.general` 与
 *   `getDefaultPreferences()`），恢复默认永不改变用户的语言/主题偏好。
 */
export const DEFAULT_LANGUAGE = 'system';
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

// 与 app/features/browser/useBrowserSuspendScheduler.ts 的 DEFAULT_IDLE_MS 是同一产品默认
// （15 分钟；Rust 侧 serde default 同步为 900_000，见 crates/kernel/src/config.rs）。
// 调度器侧 DEFAULT_IDLE_MS 为本常量的别名引用：改动默认值时只改此处，
// 跨语言漂移由 Rust 字面量断言 + 本文件钉值测试捕获。
export const DEFAULT_BROWSER_SUSPEND_MS = 900_000;

// 下载模式产品默认（自动保存；Rust 侧 DownloadMode::Auto 同步）。
// downloadSettings 走独立桥而非偏好 patch，此常量仅作恢复目标单一真源。
export const DEFAULT_DOWNLOAD_MODE = 'auto' as const;

export function getDefaultPreferences(): AppPreferencePatch {
  return {
    // 刻意不含 language / themeMode：二者是用户个人基线（跟随系统或用户选定值），
    // 恢复全部默认不改动（产品决策 2026-09-27）。
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
    browserInactiveTabSuspendMs: DEFAULT_BROWSER_SUSPEND_MS,
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
    case 'browserInactiveTabSuspendMs':
      return DEFAULT_BROWSER_SUSPEND_MS;
    case 'font:ui':
    case 'font:code':
    case 'font:terminal':
      return '';
    default:
      return undefined;
  }
}
