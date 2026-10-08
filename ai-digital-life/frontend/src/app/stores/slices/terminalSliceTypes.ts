/**
 * 终端切片类型定义与常量
 * 从 terminalSlice.ts 提取，避免循环依赖
 */
import { createUiId } from '../shared';
import type { TerminalProfile } from '../types';
import type { TabLocation } from './tabLocation';

export type TerminalPaneStatus = 'idle' | 'running' | 'terminated';

/**
 * 一个终端标签内的一个实时终端窗口，对应一个**独立 PTY 会话**。
 * `id` 稳定不变（`createUiId('pane')`）；`sessionId` 落盘但**重启忽略并重建**。
 */
export interface TerminalPane {
  id: string;
  sessionId?: string;
  profile: TerminalProfile;
  status: TerminalPaneStatus;
  label?: string;
  colorIndex: number;
}

export interface TerminalTabState {
  id: string;
  workspaceId: string;
  title: string;
  profile: TerminalProfile;
  panes: TerminalPane[];
  activePaneId?: string;
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

const TERMINAL_PANE_STATUS_SET: Record<TerminalPaneStatus, true> = {
  idle: true,
  running: true,
  terminated: true,
};

/** 由给定 profile 与颜色下标创建一个全新的空窗格（`status: 'idle'`，无会话）。 */
export function createTerminalPane(profile: TerminalProfile, colorIndex: number): TerminalPane {
  return { id: createUiId('pane'), profile, status: 'idle', colorIndex };
}

/**
 * 标注限 1 个码点：按 Unicode 码点取首个，避免把代理对 / emoji 截半。
 * 卡片内联输入与两处 Hook 共用同一实现（输入框不设 `maxLength`，提交时统一在此收口）；
 * 空串表示清除标注。
 */
export function clampPaneLabel(value: string): string {
  return Array.from(value).slice(0, 1).join('');
}

/**
 * 单个窗格的读盘校验器：任一字段非法即返回 `undefined`（拒绝该项）。
 * 可选字段 `sessionId` / `label` 仅在存在时要求为 string（缺失合法）。
 */
export function readTerminalPane(raw: unknown): TerminalPane | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.id !== 'string') {
    return undefined;
  }
  if (!isTerminalProfile(record.profile)) {
    return undefined;
  }
  if (
    typeof record.status !== 'string' ||
    !(TERMINAL_PANE_STATUS_SET as Record<string, true>)[record.status]
  ) {
    return undefined;
  }
  if (typeof record.colorIndex !== 'number') {
    return undefined;
  }
  if (record.sessionId !== undefined && typeof record.sessionId !== 'string') {
    return undefined;
  }
  if (record.label !== undefined && typeof record.label !== 'string') {
    return undefined;
  }
  const pane: TerminalPane = {
    id: record.id,
    profile: record.profile,
    status: record.status as TerminalPaneStatus,
    colorIndex: record.colorIndex,
  };
  if (typeof record.sessionId === 'string') {
    pane.sessionId = record.sessionId;
  }
  if (typeof record.label === 'string') {
    pane.label = record.label;
  }
  return pane;
}

/**
 * 窗格数组读盘校验器：非数组 → `undefined`；数组内**逐项**校验，
 * 任一非法项即整体判为不合法（`undefined`）—— 与 `readObjectArray` 的
 * 「整项拒绝」一致，绝不逐项剔除畸形元素后继续（否则畸形窗格会被原样写回 store）。
 */
export function readTerminalPanes(raw: unknown): TerminalPane[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const panes: TerminalPane[] = [];
  for (const item of raw) {
    const pane = readTerminalPane(item);
    if (pane === undefined) {
      return undefined;
    }
    panes.push(pane);
  }
  return panes;
}

/** 活动窗格：优先匹配 `activePaneId`，否则回退首个窗格；无窗格时 `undefined`。 */
export function activePaneOf(tab: TerminalTabState): TerminalPane | undefined {
  return tab.panes.find((pane) => pane.id === tab.activePaneId) ?? tab.panes[0];
}

/** 返回 0..N 中第一个未被占用的颜色下标；0..N-1 全部占用时返回 `panes.length`。 */
export function nextPaneColorIndex(panes: TerminalPane[]): number {
  const used = new Set(panes.map((pane) => pane.colorIndex));
  let index = 0;
  while (used.has(index)) {
    index += 1;
  }
  return index;
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

/** 终端字号：默认 13，可调 10–24（更多终端操作 → 增大/减小字号，持久化）。 */
export const TERMINAL_FONT_SIZE_DEFAULT = 13;
export const TERMINAL_FONT_SIZE_MIN = 10;
export const TERMINAL_FONT_SIZE_MAX = 24;

/** 字号钳制：非有限数（含 Infinity/NaN）一律回默认——视为脏输入而非越界，不钳 MAX。 */
export function clampTerminalFontSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return TERMINAL_FONT_SIZE_DEFAULT;
  }
  return Math.max(TERMINAL_FONT_SIZE_MIN, Math.min(TERMINAL_FONT_SIZE_MAX, Math.round(value)));
}
