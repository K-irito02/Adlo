import { describe, it, expect, vi } from 'vitest';
import { resolveTreeStats } from './treeStats';
import type { TreeCacheStats } from '@shared/ipc/storage';

const STATS = {
  workspaceCount: 2,
  totalBytes: 100,
  oldestCapturedAt: null,
  newestCapturedAt: null,
  enabled: true,
  ttlMinutes: 15,
} as TreeCacheStats;

describe('resolveTreeStats', () => {
  it('缓存命中直接返回，不碰桥', async () => {
    const bridge = { getTreeCacheStats: vi.fn() };
    await expect(resolveTreeStats(STATS, bridge)).resolves.toBe(STATS);
    expect(bridge.getTreeCacheStats).not.toHaveBeenCalled();
  });

  it('无缓存时现拉成功返回数据', async () => {
    const bridge = {
      getTreeCacheStats: vi.fn(async () => ({ ok: true as const, data: STATS })),
    };
    await expect(resolveTreeStats(null, bridge)).resolves.toBe(STATS);
  });

  it('桥缺席/无方法/回 !ok/抛错一律回 null（fail-open）', async () => {
    await expect(resolveTreeStats(null, undefined)).resolves.toBeNull();
    await expect(resolveTreeStats(null, {})).resolves.toBeNull();
    const notOk = {
      getTreeCacheStats: vi.fn(async () => ({
        ok: false as const,
        error: { code: 'Internal', message: 'x' },
      })),
    };
    await expect(resolveTreeStats(null, notOk)).resolves.toBeNull();
    const throwing = {
      getTreeCacheStats: vi.fn(async () => {
        throw new Error('boom');
      }),
    };
    await expect(resolveTreeStats(null, throwing)).resolves.toBeNull();
  });
});
