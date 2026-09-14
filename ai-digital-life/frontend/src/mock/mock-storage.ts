import type { IpcResult } from '@ai-digital-life/kernel';
import type {
  StorageApplyResult,
  StorageBridge,
  StorageCategoryStatus,
  StorageMode,
  StoragePending,
  StorageStatus,
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
}

/** 为给定根构造 10 类分类状态（`downloads_default` 不可移动，与后端一致）。 */
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
 * 恒返回 ok；`restartApp` 为 no-op（浏览器无重启能力，B5）。
 */
export function createMockStorage(config: MockStorageConfig = {}): StorageBridge {
  let mode: StorageMode = config.mode ?? 'unified';
  const root = config.root ?? DEFAULT_MOCK_STORAGE_ROOT;
  let pending: StoragePending | null = null;

  const preflightOk = (): StorageApplyResult['preflight'] => ({
    ok: true,
    errors: [],
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

    restartApp: async (): Promise<IpcResult<void>> => ({ ok: true, data: undefined }),
  };
}
