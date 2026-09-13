/**
 * 终端切片类型定义与常量
 * 从 terminalSlice.ts 提取，避免循环依赖
 */
import type { TerminalProfile } from '../types';

export interface TerminalTabState {
  id: string;
  workspaceId: string;
  title: string;
  profile: TerminalProfile;
  sessionId?: string;
  status: 'idle' | 'running' | 'terminated';
  isPinned: boolean;
  pinnedAt?: number;
  sortOrder: number;
}

export interface CommandHistoryEntry {
  id: string;
  command: string;
  timestamp: number;
}

// Local storage keys
export const TERMINAL_TABS_KEY = 'adl-ui:terminal-tabs';
export const TERMINAL_ACTIVE_TAB_KEY = 'adl-ui:terminal-active-tab';
export const TERMINAL_DEFAULT_PROFILE_KEY = 'adl-ui:terminal-default-profile';
export const TERMINAL_WORKSPACE_DEFAULT_PROFILES_KEY = 'adl-ui:terminal-workspace-default-profiles';
export const TERMINAL_NAVIGATOR_WIDTH_KEY = 'adl-ui:terminal-navigator-width';
export const TERMINAL_NAVIGATOR_COLLAPSED_KEY = 'adl-ui:navigator-collapsed';
export const TERMINAL_WORKSPACE_EXPANDED_KEY = 'adl-ui:terminal-workspace-expanded';
export const TERMINAL_COMMAND_HISTORY_KEY = 'adl-ui:terminal-command-history';
export const TERMINAL_WORKSPACE_ID_KEY = 'adl-ui:terminal-workspace-id';
export const TERMINAL_SHELL_SELECTOR_PROFILE_KEY = 'adl-ui:terminal-shell-selector-profile';

/** 与 TerminalProfile 联合类型单源绑定：新增终端类型时只改此处 */
const TERMINAL_PROFILES: readonly TerminalProfile[] = ['powershell', 'bash', 'cmd'];

export function isTerminalProfile(value: unknown): value is TerminalProfile {
  return typeof value === 'string' && (TERMINAL_PROFILES as readonly string[]).includes(value);
}

/**
 * 归一化选择器 profile：持久化值合法则采用，否则回退到全局默认 profile。
 * 以全局默认（而非固定 'powershell'）为回退，保持"首次无记录时跟随默认"语义。
 */
export function normalizeTerminalShellProfile(
  saved: unknown,
  fallback: TerminalProfile,
): TerminalProfile {
  return isTerminalProfile(saved) ? saved : fallback;
}

// Constants
export const TERMINAL_NAVIGATOR_WIDTH_MIN = 180;
export const TERMINAL_NAVIGATOR_WIDTH_MAX = 300;
export const DEFAULT_TERMINAL_NAVIGATOR_WIDTH = 240;
