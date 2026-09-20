import { describe, it, expect } from 'vitest';
import { registryEntries } from '../registry';
import { parsePersistKey, PERSIST_DOMAINS, type PruneCtx } from '../entry';

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

  it('keys are unique across the registry', () => {
    const keys = registryEntries.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('store fields are unique — one field must not be declared by two keys', () => {
    const fields = registryEntries.map((entry) => entry.field as string);
    const duplicates = fields.filter((field, index) => fields.indexOf(field) !== index);
    expect(duplicates).toEqual([]);
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
