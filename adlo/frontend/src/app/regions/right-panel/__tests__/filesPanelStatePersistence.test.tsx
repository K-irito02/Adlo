import { describe, it, expect, beforeEach, vi } from 'vitest';
import { stubStorage, expectPersistsAcrossRestart } from '@stores/persisted/__tests__/helpers';
import { useAppStore } from '@stores/slicedStore';
import { hydrateAll } from '@stores/persisted/hydrate';

describe('files panel sub-state persistence', () => {
  beforeEach(() => {
    stubStorage();
  });

  it('restores the clicked tree node per workspace', () => {
    expectPersistsAcrossRestart(
      'adl:files.clickedNode',
      (value) => {
        const node = value['workspace_a'];
        if (node?.path !== undefined && node.kind !== undefined) {
          useAppStore.getState().setFileTreeClickedNode('workspace_a', node.path, node.kind);
        }
      },
      () => hydrateAll().patch.fileTreeClicked,
      { workspace_a: { path: 'src/app.ts', kind: 'file' } },
    );
  });

  it('restores the search flags object', () => {
    expectPersistsAcrossRestart(
      'adl:files.searchFlags',
      (value) => useAppStore.getState().setSearchFlags(value),
      () => hydrateAll().patch.searchFlags,
      { matchCase: true, matchWholeWord: false, useRegex: true },
    );
  });

  it('restores the outline expansion per workspace', () => {
    expectPersistsAcrossRestart(
      'adl:files.outlineExpanded',
      (value) =>
        useAppStore.getState().setFilesOutlineExpanded('workspace_a', value['workspace_a'] ?? []),
      () => hydrateAll().patch.filesOutlineExpanded,
      { workspace_a: ['fn-main', 'cls-a'] },
    );
  });

  it('does not write when the same node is selected twice', async () => {
    const { flushCrossSliceWrites } = await import('@stores/storageHelpers');
    stubStorage();
    // 单例 store 跨用例存活：用本文件内唯一的三元组，避开前序用例的选中态
    const state = useAppStore.getState();
    const listener = vi.fn();
    const unsubscribe = useAppStore.subscribe(listener);
    try {
      state.setFileTreeClickedNode('workspace_nodup', 'src/nodup.ts', 'file');
      flushCrossSliceWrites();
      expect(localStorage.getItem('adl:files.clickedNode')).not.toBeNull();
      expect(listener).toHaveBeenCalled();
      listener.mockClear();
      const storedBefore = localStorage.getItem('adl:files.clickedNode');
      state.setFileTreeClickedNode('workspace_nodup', 'src/nodup.ts', 'file');
      flushCrossSliceWrites();
      // 提前 return：既无 store 通知，也无落盘
      expect(listener).not.toHaveBeenCalled();
      expect(localStorage.getItem('adl:files.clickedNode')).toBe(storedBefore);
    } finally {
      unsubscribe();
    }
  });
});
