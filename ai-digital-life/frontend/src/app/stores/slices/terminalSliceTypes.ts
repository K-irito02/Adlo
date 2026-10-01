/**
 * 终端切片类型定义与常量
 * 从 terminalSlice.ts 提取，避免循环依赖
 */
import type { TerminalProfile } from '../types';
import type { TabLocation } from './tabLocation';

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
  location?: TabLocation;
}

// 注意：“命令历史（最近命令）”功能已彻底删除，不再保留 CommandHistoryEntry 与
// TERMINAL_COMMAND_HISTORY_KEY。旧版本 localStorage 中的孤儿键无需迁移，会自然废弃。

// 本地存储键已迁至 persisted/registry.ts（adl:terminal.* 命名空间，Task 10）。
// 此处不再导出任何 adl-ui:terminal-* / adl-terminal:* 遗留字面量，旧键由启动清理删除。

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
 * profile 白名单的**唯一**读盘校验器（Task 10 R2）。
 *
 * 登记表条目的 `read` 声明与 terminalComposite 的回退链都必须引用它 ——
 * 本应用对"合法 profile"只能有一份定义，否则某处弱化过的判定会绕过登记表
 * 的拒绝分支，把已判损坏的值重新写回 store。
 */
export function readTerminalProfile(raw: unknown): TerminalProfile | undefined {
  return isTerminalProfile(raw) ? raw : undefined;
}

/**
 * 由标签数组构建 id → 标签映射（`terminalTabsById`）。
 *
 * 放在叶子模块：终端的 setter（terminalSlice）与跨键水合（terminalComposite）
 * 需要**同一份**语义，同一段逻辑不允许在两处各写一遍。
 */
export function buildTabsById(tabs: TerminalTabState[]): Record<string, TerminalTabState> {
  const result: Record<string, TerminalTabState> = {};
  for (const tab of tabs) {
    result[tab.id] = tab;
  }
  return result;
}

// Constants
export const TERMINAL_NAVIGATOR_WIDTH_MIN = 180;
export const TERMINAL_NAVIGATOR_WIDTH_MAX = 300;
export const DEFAULT_TERMINAL_NAVIGATOR_WIDTH = 240;
