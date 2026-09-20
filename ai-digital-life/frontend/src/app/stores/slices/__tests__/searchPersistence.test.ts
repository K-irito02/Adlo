import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import { flushCrossSliceWrites } from '@stores/storageHelpers';
import { hydrateAll, resetHydrationForTest } from '@stores/persisted/hydrate';

describe('search settings persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHydrationForTest();
  });

  it('restores the per-workspace ignored paths after a simulated restart', () => {
    useAppStore.getState().setSearchIgnoredPaths('workspace_a', ['node_modules']);
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.searchIgnoredPaths).toEqual({ workspace_a: ['node_modules'] });
  });

  it('clamps an out-of-range page size on hydration', () => {
    localStorage.setItem('adl:search.pageSize', '99999');
    const { patch } = hydrateAll();
    expect(patch.searchPageSize).toBe(1000);
  });
});
