import { describe, it, expect } from 'vitest';
import { registryEntries } from '../registry';
import { parsePersistKey, PERSIST_DOMAINS, type PruneCtx } from '../entry';
import type { StoreState } from '../../StoreState';

const SYNC_BYTES_LIMIT = 32 * 1024;

const EMPTY_CTX: PruneCtx = {
  workspaceIds: new Set<string>(),
  loadedDirPaths: new Map(),
  tabIds: new Set<string>(),
};

describe('registry self-check', () => {
  it('every key matches the adl:<domain>.<name>[.vN] pattern with a known domain', () => {
    for (const entry of registryEntries) {
      const parsed = parsePersistKey(entry.key);
      expect(parsed, `key ${entry.key} must be a valid persist key`).not.toBeNull();
      expect(PERSIST_DOMAINS).toContain(parsed?.domain);
    }
  });

  // 此处不再对「键名唯一」做运行时断言：registry 是对象字面量，重复键在编译期即报错
  // （见 registry.ts 的规则 1），编译期保证严格强于等价的运行时断言。
  // 但该保证以 registry 保持为对象字面量为前提 —— 若日后改为运行时构造的映射
  // （如 Object.fromEntries），编译期保证消失，此处必须重新引入唯一性断言。

  it('store fields are unique — one field must not be declared by two keys', () => {
    const fields = registryEntries
      .map((entry) => entry.field)
      .filter((field) => field !== undefined) as (keyof StoreState)[];
    const duplicates = fields.filter((field, index) => fields.indexOf(field) !== index);
    expect(duplicates).toEqual([]);
  });

  it('every entry declares exactly one of field / apply', () => {
    for (const entry of registryEntries) {
      const hasField = entry.field !== undefined;
      const hasApply = entry.apply !== undefined;
      expect(
        hasField !== hasApply,
        `entry ${entry.key} must declare exactly one of field / apply (got field=${hasField}, apply=${hasApply})`,
      ).toBe(true);
    }
  });

  it('every entry declares a scope', () => {
    for (const entry of registryEntries) {
      expect(['global', 'byWorkspaceId', 'byTabId']).toContain(entry.scope);
    }
  });

  it('sync entries stay within the 32 KB budget — large objects must set sync: false', () => {
    for (const entry of registryEntries) {
      if (entry.sync === false) {
        continue;
      }
      const bytes = JSON.stringify(entry.fallback).length;
      expect(
        bytes,
        `sync entry ${entry.key} exceeds the ${SYNC_BYTES_LIMIT} byte budget`,
      ).toBeLessThanOrEqual(SYNC_BYTES_LIMIT);
    }
  });

  it('workspace-scoped entries skip pruning when the reference list is empty', () => {
    for (const entry of registryEntries) {
      if (!entry.prune || entry.scope === 'global') {
        continue;
      }
      const sample = entry.fallback as Record<string, unknown>;
      const result = entry.prune(sample, EMPTY_CTX);
      expect(result.changed, `${entry.key} must not prune with an empty reference list`).toBe(
        false,
      );
    }
  });
});
