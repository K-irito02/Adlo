import type { DownloadSettings } from '@shared/ipc/download';
import type { StorageStatus, TreeCacheOptions, TreeCacheStats } from '@shared/ipc/storage';
import type { StorageTreeBlock } from '@shared/settings-reset/storageReset';
import { TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES } from '@features/terminal/terminalHistoryBudget';
import { isDownloadPathAtDefault } from './downloadPathReset';

/** Rust 缺省（`TreeCacheOptions::default`）：stats 不可用时开关/TTL 的回退值。
 * 注意：`stores/actions/generalActions.ts` 有同值字面量 `RUST_TREE_CACHE_DEFAULTS`
 *（层级原因不直接引用本导出；改 Rust 缺省时两处同步，Phase 4 R1-7.4 记录）。 */
export const TREE_CACHE_DEFAULTS: TreeCacheOptions = { enabled: true, ttlMinutes: 15 };

/** 核心数据路径是否已持久化为默认（统一根 + 根等于默认根；有未应用路径草稿则否）。 */
export function isCorePathsAtDefault(status: StorageStatus | null, draftsDirty: boolean): boolean {
  return (
    status !== null &&
    !draftsDirty &&
    status.mode === 'unified' &&
    status.root === status.defaultRoot
  );
}

/** 树缓存是否已默认（stats 未加载/失败 → 未知 → false，不计为默认）。 */
export function isTreeCacheAtDefault(treeStats: TreeCacheStats | null): boolean {
  return (
    treeStats !== null &&
    treeStats.enabled &&
    treeStats.ttlMinutes === TREE_CACHE_DEFAULTS.ttlMinutes
  );
}

/** 树缓存块的展示/执行变体（原内联于 `openGroupResetDialog`，提取后组件与恢复计划共用）。 */
export function treeBlockOf(treeStats: TreeCacheStats | null): StorageTreeBlock {
  if (isTreeCacheAtDefault(treeStats)) {
    return 'hidden';
  }
  if (treeStats === null) {
    return 'full';
  }
  if (treeStats.enabled) {
    return 'ttl';
  }
  return treeStats.ttlMinutes === TREE_CACHE_DEFAULTS.ttlMinutes ? 'reenable' : 'full';
}

/** 终端历史磁盘预算是否已默认（config 未加载 → 未知 → false，不计为默认）。 */
export function isBudgetAtDefault(budgetBytes: number | undefined): boolean {
  return budgetBytes !== undefined && budgetBytes === TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES;
}

export interface StorageBlocksAtDefaultInput {
  status: StorageStatus | null;
  treeStats: TreeCacheStats | null;
  budgetBytes: number | undefined;
  downloadSettings: DownloadSettings;
  downloadSettingsLoaded: boolean;
  /** 路径草稿是否有未应用修改（挂载组件实时传入；预取初始化恒 false）。 */
  draftsDirty: boolean;
}

/**
 * 存储组四块（核心路径/树缓存/终端预算/下载路径）是否全默认 —— 侧边栏
 * 「恢复默认」禁用聚合的单一口径（`SettingsPanel` 与 `StorageSettings` 双消费者
 * 共用，防漂移）。
 *
 * - `status` 缺失（未加载/失败）→ `null`（未知，调用方不写聚合）；
 * - 其余任一块数据源未知（如 treeStats 未加载、budget 未定义、download 未回读）
 *   → `false`（未知不计为默认，侧边栏 fail-open 保持启用）。
 */
export function computeStorageBlocksAtDefault(input: StorageBlocksAtDefaultInput): boolean | null {
  if (input.status === null) {
    return null;
  }
  const downloadAtDefault = isDownloadPathAtDefault(
    input.downloadSettings,
    input.downloadSettingsLoaded,
  );
  return (
    isCorePathsAtDefault(input.status, input.draftsDirty) &&
    isTreeCacheAtDefault(input.treeStats) &&
    isBudgetAtDefault(input.budgetBytes) &&
    downloadAtDefault
  );
}
