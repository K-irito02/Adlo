import { describe, it, expect } from 'vitest';
import type { DownloadSettings } from '@shared/ipc/download';
import type { StorageStatus, TreeCacheStats } from '@shared/ipc/storage';
import {
  computeStorageBlocksAtDefault,
  isCorePathsAtDefault,
  isTreeCacheAtDefault,
  TREE_CACHE_DEFAULTS,
  treeBlockOf,
  type StorageBlocksAtDefaultInput,
} from './storageAtDefault';

/** Phase 4 R1-11：共享聚合口径的纯函数直测（此前仅经组件集成测试覆盖）。 */
describe('storageAtDefault', () => {
  const status: StorageStatus = {
    mode: 'unified',
    root: 'C:/data',
    defaultRoot: 'C:/data',
    categories: [],
    locatorPath: 'C:/data/storage-locator.json',
    pending: null,
    lastReport: null,
  };
  const treeStats: TreeCacheStats = {
    workspaceCount: 0,
    totalBytes: 0,
    oldestCapturedAt: null,
    newestCapturedAt: null,
    enabled: true,
    ttlMinutes: TREE_CACHE_DEFAULTS.ttlMinutes,
  };
  const download: DownloadSettings = {
    mode: 'auto',
    default_path: '',
    auto_migrate_on_path_change: false,
  };
  const input = (
    patch: Partial<StorageBlocksAtDefaultInput> = {},
  ): StorageBlocksAtDefaultInput => ({
    status,
    treeStats,
    downloadSettings: download,
    downloadSettingsLoaded: true,
    draftsDirty: false,
    ...patch,
  });

  it('returns null when status is missing (unknown, caller keeps aggregate)', () => {
    expect(computeStorageBlocksAtDefault(input({ status: null }))).toBeNull();
  });

  it('returns true only when all blocks are at default', () => {
    expect(computeStorageBlocksAtDefault(input())).toBe(true);
  });

  it('returns false when any block source is unknown (fail-open)', () => {
    // 草稿脏 → 核心非默认。
    expect(computeStorageBlocksAtDefault(input({ draftsDirty: true }))).toBe(false);
    // 树 stats 未加载 → 非默认。
    expect(computeStorageBlocksAtDefault(input({ treeStats: null }))).toBe(false);
    // 下载未回读 → 非默认。
    expect(computeStorageBlocksAtDefault(input({ downloadSettingsLoaded: false }))).toBe(false);
  });

  it('isCorePathsAtDefault requires unified mode, matching root and clean drafts', () => {
    expect(isCorePathsAtDefault(status, false)).toBe(true);
    expect(isCorePathsAtDefault(status, true)).toBe(false);
    expect(isCorePathsAtDefault(null, false)).toBe(false);
    expect(isCorePathsAtDefault({ ...status, mode: 'per_category' }, false)).toBe(false);
    expect(isCorePathsAtDefault({ ...status, root: 'D:/other' }, false)).toBe(false);
  });

  it('isTreeCacheAtDefault treats unknown as non-default', () => {
    expect(isTreeCacheAtDefault(treeStats)).toBe(true);
    expect(isTreeCacheAtDefault(null)).toBe(false);
    expect(isTreeCacheAtDefault({ ...treeStats, enabled: false })).toBe(false);
  });

  it('treeBlockOf maps every tree state to its reset variant (at-default → hidden)', () => {
    expect(treeBlockOf(treeStats)).toBe('hidden');
    expect(treeBlockOf(null)).toBe('full');
    expect(treeBlockOf({ ...treeStats, ttlMinutes: 30 })).toBe('ttl');
    expect(treeBlockOf({ ...treeStats, enabled: false })).toBe('reenable');
    expect(treeBlockOf({ ...treeStats, enabled: false, ttlMinutes: 30 })).toBe('full');
  });
});
