import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hydrateAll, resetHydrationForTest } from '../hydrate';

const KEY = 'adl:files.workspaceExpanded';

describe('hydrateAll', () => {
  beforeEach(() => {
    // 先恢复上一条用例可能留下的 Storage.prototype 桩，否则后面的用例会在
    // "storage 已损坏"的环境下空跑（getItem 被桩成抛错 → 全部退化为 fallback）。
    vi.restoreAllMocks();
    // 损坏 JSON 会经 readJson 打一条 console.warn（其本身由 storageHelpers.test.ts 断言），
    // 这里静音以保持用例输出干净。
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.clear();
    resetHydrationForTest();
  });

  it('falls back when there is no stored value', () => {
    const { patch, dirtyKeys } = hydrateAll();
    expect(patch.workspaceTreeExpandedInFileNav).toEqual({});
    expect(dirtyKeys).toEqual([]);
  });

  it('returns the stored value when it is valid', () => {
    localStorage.setItem(KEY, JSON.stringify({ workspace_a: true }));
    const { patch, dirtyKeys } = hydrateAll();
    expect(patch.workspaceTreeExpandedInFileNav).toEqual({ workspace_a: true });
    expect(dirtyKeys).toEqual([]);
  });

  it('falls back and marks dirty on malformed JSON', () => {
    localStorage.setItem(KEY, '{not json');
    const { patch, dirtyKeys } = hydrateAll();
    expect(patch.workspaceTreeExpandedInFileNav).toEqual({});
    expect(dirtyKeys).toContain(KEY);
  });

  it('falls back and marks dirty when the reader rejects the shape', () => {
    localStorage.setItem(KEY, JSON.stringify({ workspace_a: 'yes' }));
    const { patch, dirtyKeys } = hydrateAll();
    expect(patch.workspaceTreeExpandedInFileNav).toEqual({});
    expect(dirtyKeys).toContain(KEY);
  });

  it('degrades to fallbacks when storage itself throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    const { patch } = hydrateAll();
    expect(patch.workspaceTreeExpandedInFileNav).toEqual({});
  });

  it('only performs the actual read once (idempotent)', () => {
    localStorage.setItem(KEY, JSON.stringify({ workspace_a: true }));
    const first = hydrateAll();
    localStorage.setItem(KEY, JSON.stringify({ workspace_b: true }));
    const second = hydrateAll();
    expect(second).toEqual(first);
  });
});
