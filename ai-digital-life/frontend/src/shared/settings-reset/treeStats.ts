import type { IpcResult } from '@ai-digital-life/kernel';
import type { TreeCacheStats } from '@shared/ipc/storage';

/** 仅声明本模块用到的成员，避免依赖完整 bridge 类型（与 storageReset.ts:StorageBridgeLike 同惯例）。 */
export interface TreeStatsBridgeLike {
  getTreeCacheStats?: () => Promise<IpcResult<TreeCacheStats>>;
}

/**
 * 解析恢复计划用的树缓存统计：“缓存命中则用、否则现拉、失败→null”
 *（fail-open 未知态：拉取失败按非默认处理，由调用方展示与执行）。
 * StorageSettings.openGroupResetDialog 与 SettingsPanel.handleOpenResetAll 共用，防两处漂移。
 */
export async function resolveTreeStats(
  cached: TreeCacheStats | null,
  bridge?: TreeStatsBridgeLike,
): Promise<TreeCacheStats | null> {
  if (cached !== null) {
    return cached;
  }
  if (!bridge?.getTreeCacheStats) {
    return null;
  }
  try {
    const result = await bridge.getTreeCacheStats();
    return result.ok ? result.data : null;
  } catch {
    return null;
  }
}
