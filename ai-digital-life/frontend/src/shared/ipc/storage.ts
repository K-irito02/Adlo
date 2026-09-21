import type { IpcResult } from '@ai-digital-life/kernel';

export type { IpcResult };

/** 存储模式：统一根 (unified) 或按分类自定义 (per_category)。 */
export type StorageMode = 'unified' | 'per_category';

/** 单个存储分类的路径与占用状态。 */
export interface StorageCategoryStatus {
  /** 分类 key，与 Rust `StorageCategory::key` 一致。 */
  key: string;
  /** 分类当前解析到的绝对路径。 */
  path: string;
  /** 是否允许迁移（`downloads_default` 固定不可移动）。 */
  movable: boolean;
  /** 路径当前是否存在。 */
  exists: boolean;
  /** 占用字节数。 */
  bytes: number;
  /** 文件数量。 */
  files: number;
  /** 该分类目录下非本应用所有的外部文件（迁移时保留）。 */
  foreignFiles: string[];
}

/** 迁移后因含外部文件而保留的旧目录。 */
export interface KeptDir {
  path: string;
  foreignFiles: string[];
}

/** 最近一次迁移的结果报告。 */
export interface StorageReport {
  at: number;
  ok: boolean;
  /** true 时指针已切换持久化（即使 ok=false 也不得重跑迁移）。 */
  switched: boolean;
  movedFiles: number;
  movedBytes: number;
  removedDirs: string[];
  keptDirs: KeptDir[];
  retained: boolean;
  error: string | null;
}

/** 待执行迁移的失败信息（成功挂起时为非失败的空占位）。 */
export interface StoragePending {
  failed: boolean;
  error: string | null;
}

/** 存储总览：模式、根路径、10 类分类状态、locator 落点与待迁移/报告。 */
export interface StorageStatus {
  mode: StorageMode;
  root: string;
  categories: StorageCategoryStatus[];
  locatorPath: string;
  pending: StoragePending | null;
  lastReport: StorageReport | null;
}

/**
 * 工作区树缓存统计（设置页展示用）。
 * 与 Rust `TreeCacheStats`（`#[serde(rename_all = "camelCase")]`）逐字段对齐；
 * 空表时计数为 0、时间为 `null`；`enabled`/`ttlMinutes` 与 `get_options()` 同源。
 */
export interface TreeCacheStats {
  workspaceCount: number;
  totalBytes: number;
  oldestCapturedAt: number | null;
  newestCapturedAt: number | null;
  enabled: boolean;
  ttlMinutes: number;
}

/**
 * 工作区树缓存开关与 TTL（分钟）；缺省 `enabled=true, ttlMinutes=15`。
 * 与 Rust `TreeCacheOptions`（`#[serde(rename_all = "camelCase")]`）逐字段对齐。
 */
export interface TreeCacheOptions {
  enabled: boolean;
  ttlMinutes: number;
}

/** 提交给后端校验/写入的路径变更补丁。 */
export interface StoragePathPatch {
  mode: StorageMode;
  root?: string | null;
  categories: Record<string, string>;
  retainSource: boolean;
}

/** 某分类下的外部文件扫描结果。 */
export interface StorageForeignScan {
  category: string;
  root: string;
  foreignFiles: string[];
}

/** 迁移预检结果（不写盘）。 */
export interface StoragePreflight {
  ok: boolean;
  errors: string[];
  warnings: string[];
  totalFiles: number;
  totalBytes: number;
  freeBytes: number;
}

/** `setPaths` 的返回：是否需要重启以执行迁移 + 预检结果。 */
export interface StorageApplyResult {
  restartRequired: boolean;
  preflight: StoragePreflight;
}

/**
 * 存储路径管理桥接能力
 * 用于: 读取存储分类占用/状态、预检路径变更、写入待迁移补丁并（桌面端）重启应用
 * 后端路由: POST /storage/status | /storage/scan-foreign | /storage/preflight |
 *           /storage/set-paths | /storage/cancel-pending
 * 后端命令: storage_get_status | storage_scan_foreign_cmd | storage_preflight_cmd |
 *           storage_set_paths | storage_cancel_pending | app_restart
 */
export interface StorageBridge {
  /**
   * 读取当前存储模式、根路径与各分类占用。
   * @command storage_get_status / POST /storage/status
   * @see tauri-bridge/index.ts → storage.getStatus
   * @see preview-bridge/index.ts → storage.getStatus
   * @see mock-bridge.ts → storage.getStatus
   */
  getStatus: () => Promise<IpcResult<StorageStatus>>;
  /**
   * 扫描各分类目录下的外部（非本应用所有）文件。
   * @command storage_scan_foreign_cmd / POST /storage/scan-foreign
   * @see tauri-bridge/index.ts → storage.scanForeign
   * @see preview-bridge/index.ts → storage.scanForeign
   * @see mock-bridge.ts → storage.scanForeign
   */
  scanForeign: () => Promise<IpcResult<StorageForeignScan[]>>;
  /**
   * 预检一个路径补丁，不写盘。
   * @param patch 目标模式/根/分类路径与是否保留源
   * @command storage_preflight_cmd / POST /storage/preflight
   * @see tauri-bridge/index.ts → storage.preflight
   * @see preview-bridge/index.ts → storage.preflight
   * @see mock-bridge.ts → storage.preflight
   */
  preflight: (patch: StoragePathPatch) => Promise<IpcResult<StoragePreflight>>;
  /**
   * 写入待迁移补丁（迁移在下次启动时执行）。
   * @param patch 目标模式/根/分类路径与是否保留源
   * @param applyNow 是否请求立即重启以执行迁移
   * @command storage_set_paths / POST /storage/set-paths
   * @see tauri-bridge/index.ts → storage.setPaths
   * @see preview-bridge/index.ts → storage.setPaths
   * @see mock-bridge.ts → storage.setPaths
   */
  setPaths: (patch: StoragePathPatch, applyNow: boolean) => Promise<IpcResult<StorageApplyResult>>;
  /**
   * 取消已挂起的迁移。
   * @command storage_cancel_pending / POST /storage/cancel-pending
   * @see tauri-bridge/index.ts → storage.cancelPending
   * @see preview-bridge/index.ts → storage.cancelPending
   * @see mock-bridge.ts → storage.cancelPending
   */
  cancelPending: () => Promise<IpcResult<void>>;
  /**
   * 重启应用以执行挂起的迁移（仅桌面端支持；浏览器端返回 `NOT_SUPPORTED`，B5）。
   * @command app_restart
   * @see tauri-bridge/index.ts → storage.restartApp
   * @see preview-bridge/index.ts → storage.restartApp
   * @see mock-bridge.ts → storage.restartApp
   */
  restartApp: () => Promise<IpcResult<void>>;
  /**
   * 读取工作区树缓存统计（工作区数/总字节/最早与最新捕获时间）。
   * @command storage_tree_cache_stats
   * @see tauri-bridge/index.ts → storage.getTreeCacheStats
   * @see preview-bridge/index.ts → storage.getTreeCacheStats
   * @see mock-bridge.ts → storage.getTreeCacheStats
   */
  getTreeCacheStats: () => Promise<IpcResult<TreeCacheStats>>;
  /**
   * 写入工作区树缓存开关与 TTL（分钟）。
   * @param opts 树缓存选项（开关 + TTL 分钟数）
   * @command storage_tree_cache_options
   * @see tauri-bridge/index.ts → storage.setTreeCacheOptions
   * @see preview-bridge/index.ts → storage.setTreeCacheOptions
   * @see mock-bridge.ts → storage.setTreeCacheOptions
   */
  setTreeCacheOptions: (opts: TreeCacheOptions) => Promise<IpcResult<void>>;
  /**
   * 清空工作区树缓存全部行（派生数据，删后下次扫描重建）。
   * @command storage_tree_cache_clear
   * @see tauri-bridge/index.ts → storage.clearTreeCache
   * @see preview-bridge/index.ts → storage.clearTreeCache
   * @see mock-bridge.ts → storage.clearTreeCache
   */
  clearTreeCache: () => Promise<IpcResult<void>>;
}

/** 10 个分类 key，顺序与 Rust `StorageCategory::key` / `StorageCategory::ALL` 一致。 */
export const STORAGE_CATEGORY_KEYS = [
  'database',
  'downloads_db',
  'site_meta_db',
  'config',
  'clipboard',
  'snapshot',
  'dsh',
  'logs',
  'credentials_fallback',
  'downloads_default',
] as const;

/** 不可移动项 key，顺序固定（组件与测试共用）。 */
export const IMMOVABLE_ENTRY_KEYS = [
  'keyring',
  'machineId',
  'localStorage',
  'indexedDB',
  'webview2',
  'workspaceCache',
] as const;
