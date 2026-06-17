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

// Local storage keys
export const TERMINAL_TABS_KEY = 'adl-ui:terminal-tabs';
export const TERMINAL_ACTIVE_TAB_KEY = 'adl-ui:terminal-active-tab';
export const TERMINAL_DEFAULT_PROFILE_KEY = 'adl-ui:terminal-default-profile';
export const TERMINAL_WORKSPACE_DEFAULT_PROFILES_KEY = 'adl-ui:terminal-workspace-default-profiles';
export const TERMINAL_NAVIGATOR_WIDTH_KEY = 'adl-ui:terminal-navigator-width';
export const TERMINAL_NAVIGATOR_COLLAPSED_KEY = 'adl-ui:navigator-collapsed';
export const TERMINAL_WORKSPACE_EXPANDED_KEY = 'adl-ui:terminal-workspace-expanded';

// Constants
export const TERMINAL_NAVIGATOR_WIDTH_MIN = 180;
export const TERMINAL_NAVIGATOR_WIDTH_MAX = 300;
export const DEFAULT_TERMINAL_NAVIGATOR_WIDTH = 240;
