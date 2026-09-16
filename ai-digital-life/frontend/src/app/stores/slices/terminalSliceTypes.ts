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

// 注意：“命令历史（最近命令）”功能已彻底删除，不再保留 CommandHistoryEntry 与
// TERMINAL_COMMAND_HISTORY_KEY。旧版本 localStorage 中的孤儿键无需迁移，会自然废弃。

// Local storage keys
export const TERMINAL_TABS_KEY = 'adl-ui:terminal-tabs';
export const TERMINAL_ACTIVE_TAB_KEY = 'adl-ui:terminal-active-tab';
export const TERMINAL_DEFAULT_PROFILE_KEY = 'adl-ui:terminal-default-profile';
export const TERMINAL_WORKSPACE_DEFAULT_PROFILES_KEY = 'adl-ui:terminal-workspace-default-profiles';
export const TERMINAL_NAVIGATOR_WIDTH_KEY = 'adl-ui:terminal-navigator-width';
export const TERMINAL_NAVIGATOR_COLLAPSED_KEY = 'adl-ui:navigator-collapsed';
export const TERMINAL_WORKSPACE_EXPANDED_KEY = 'adl-ui:terminal-workspace-expanded';
export const TERMINAL_WORKSPACE_ID_KEY = 'adl-ui:terminal-workspace-id';
export const TERMINAL_SHELL_SELECTOR_PROFILE_KEY = 'adl-ui:terminal-shell-selector-profile';

/**
 * TerminalProfile 合法值表：Record key 受联合类型约束，新增终端类型时
 * 若不同步补 key 会编译报错，防止合法值表与类型漂移。
 */
const TERMINAL_PROFILE_SET: Record<TerminalProfile, true> = {
  powershell: true,
  bash: true,
  cmd: true,
};

const TERMINAL_PROFILES = Object.keys(TERMINAL_PROFILE_SET) as TerminalProfile[];

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
