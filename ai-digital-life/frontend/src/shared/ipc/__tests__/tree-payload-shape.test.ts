import { describe, expect, it } from 'vitest';
import type { WorkspaceTreePayload } from '@ai-digital-life/kernel';
import type { TreeCacheStats } from '../storage';

describe('tree cache payload shape', () => {
  it('payload carries the tree and its staleness', () => {
    const payload: WorkspaceTreePayload = { tree: [], fromCache: true, capturedAt: 1000 };
    expect(payload.fromCache).toBe(true);
  });

  it('stats shape matches the settings UI needs', () => {
    const stats: TreeCacheStats = {
      workspaceCount: 1,
      totalBytes: 1234,
      oldestCapturedAt: 100,
      newestCapturedAt: 200,
      enabled: true,
      ttlMinutes: 15,
    };
    expect(stats.workspaceCount).toBe(1);
    expect(stats.enabled).toBe(true);
    expect(stats.ttlMinutes).toBe(15);
  });
});
