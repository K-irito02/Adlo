import type { IpcResult } from '@ai-digital-life/kernel';
import type {
  StorageApplyResult,
  StorageBridge,
  StorageCategoryStatus,
  StorageMode,
  StoragePending,
  StoragePreflightIssue,
  StorageStatus,
  TreeCacheOptions,
  TreeCacheStats,
} from '../shared/ipc/storage';
import { STORAGE_CATEGORY_KEYS } from '../shared/ipc/storage';

/**
 * 不可移动项 key（顺序固定，与 `IMMOVABLE_ENTRY_KEYS` 一致）。
 * mock 导出便于演示/测试在不依赖类型模块的情况下引用同一组常量。
 */
export const MOCK_IMMOVABLE_KEYS = [
  'keyring',
  'machineId',
  'localStorage',
  'indexedDB',
  'webview2',
  'workspaceCache',
] as const;

/** mock 默认统一根（纯内存演示值，不指向真实磁盘）。 */
export const DEFAULT_MOCK_STORAGE_ROOT = 'C:/Users/Public/AI-Digital-Life';

export interface MockStorageConfig {
  root?: string;
  mode?: StorageMode;
  /**
   * 独立默认根（可选）：缺省跟随 `root`（演示即默认布局）。
   * 显式传入不同值可模拟"自定义根偏离默认"（真实后端 `defaults.root` 语义），
   * 供 coreAtDefault 分歧场景验证。
   */
  defaultRoot?: string;
  /**
   * 预检 issues 注入（可选）：缺省空数组。供形状契约测试构造非空
   * `errors/warnings`（对象形式 `{category, message}`，Phase 4 R2-R9-L4）。
   */
  preflightIssues?: StoragePreflightIssue[];
}

/** 为给定根构造 11 类分类状态（`downloads_default` 不可移动，与后端一致）。 */
function mockCategories(root: string): StorageCategoryStatus[] {
  return STORAGE_CATEGORY_KEYS.map((key) => ({
    key,
    path: `${root}/${key}`,
    movable: key !== 'downloads_default',
    exists: true,
    bytes: 0,
    files: 0,
    foreignFiles: [],
  }));
}

/**
 * 创建内存版存储桥（浏览器 mock / 预览模式在 ad-server 不可达时的回退实现）。
 *
 * 语义与真实后端对齐：`setPaths` 只写入挂起的待迁移项（不改当前 mode/root，
 * 与 locator 的 `pendingMigration` 一致），`cancelPending` 清空；`preflight`
 * 恒返回 ok；`restartApp` 返回 `NOT_SUPPORTED`（浏览器/mock 无重启能力，B5，
 * 与 httpBridge 同形）。
 */
export function createMockStorage(config: MockStorageConfig = {}): StorageBridge {
  let mode: StorageMode = config.mode ?? 'unified';
  const root = config.root ?? DEFAULT_MOCK_STORAGE_ROOT;
  const defaultRoot = config.defaultRoot ?? root;
  let pending: StoragePending | null = null;
  // 工作区树缓存内存态：mock 无 SQLite 行，stats 恒零值；options 内存保持。
  let treeCacheOptions: TreeCacheOptions = { enabled: true, ttlMinutes: 15 };

  const preflightOk = (): StorageApplyResult['preflight'] => ({
    ok: (config.preflightIssues ?? []).length === 0,
    errors: config.preflightIssues ?? [],
    warnings: [],
    totalFiles: 0,
    totalBytes: 0,
    freeBytes: 0,
  });

  return {
    getStatus: async (): Promise<IpcResult<StorageStatus>> => ({
      ok: true,
      data: {
        mode,
        root,
        defaultRoot,
        categories: mockCategories(root),
        locatorPath: `${root}/storage-locator.json`,
        pending,
        lastReport: null,
      },
    }),

    scanForeign: async () => ({ ok: true, data: [] }),

    preflight: async () => ({ ok: true, data: preflightOk() }),

    setPaths: async (_patch, applyNow): Promise<IpcResult<StorageApplyResult>> => {
      // 与真实后端一致：只登记挂起的待迁移项，当前 mode/root 不变（迁移在下次启动执行）。
      pending = { failed: false, error: null };
      return { ok: true, data: { restartRequired: applyNow, preflight: preflightOk() } };
    },

    cancelPending: async (): Promise<IpcResult<void>> => {
      pending = null;
      return { ok: true, data: undefined };
    },

    restartApp: async (): Promise<IpcResult<void>> => ({
      ok: false,
      error: {
        code: 'NOT_SUPPORTED',
        message:
          '[mock-storage] storage.restartApp is not supported in mock/browser mode; the change applies on next launch.',
      },
    }),

    getTreeCacheStats: async (): Promise<IpcResult<TreeCacheStats>> => ({
      ok: true,
      // 行统计恒零值（内存实现无 SQLite 行）；开关/TTL 与 set 写入的内存态同源。
      data: {
        workspaceCount: 0,
        totalBytes: 0,
        oldestCapturedAt: null,
        newestCapturedAt: null,
        enabled: treeCacheOptions.enabled,
        ttlMinutes: treeCacheOptions.ttlMinutes,
      },
    }),

    setTreeCacheOptions: async (opts: TreeCacheOptions): Promise<IpcResult<void>> => {
      treeCacheOptions = { ...opts };
      return { ok: true, data: undefined };
    },

    clearTreeCache: async (): Promise<IpcResult<void>> => {
      // 内存实现无行可删：幂等成功。
      return { ok: true, data: undefined };
    },
  };
}
