import { describe, it, expect, beforeEach } from 'vitest';
import { stubStorage, expectPersistsAcrossRestart } from '@stores/persisted/__tests__/helpers';
import { useAppStore } from '@stores/slicedStore';
import { hydrateAll } from '@stores/persisted/hydrate';

describe('changes panel sub-state persistence', () => {
  beforeEach(() => {
    stubStorage();
  });

  it('restores the status filter as a Set instance', () => {
    expectPersistsAcrossRestart(
      'adl:changes.statusFilter',
      (value) => useAppStore.getState().setChangesStatusFilter(value),
      () => hydrateAll().patch.changesStatusFilter,
      new Set(['staged', 'modified'] as const),
    );
    expect(hydrateAll().patch.changesStatusFilter).toBeInstanceOf(Set);
  });

  it('toggles a single status without disturbing the others', async () => {
    const { flushCrossSliceWrites } = await import('@stores/storageHelpers');
    stubStorage();
    const state = useAppStore.getState();
    state.setChangesStatusFilter(new Set(['staged']));
    state.toggleChangesStatusFilter('modified');
    flushCrossSliceWrites();
    expect(JSON.parse(localStorage.getItem('adl:changes.statusFilter') ?? 'null')).toEqual(
      expect.arrayContaining(['staged', 'modified']),
    );
    state.toggleChangesStatusFilter('staged');
    expect(useAppStore.getState().changesStatusFilter.has('staged')).toBe(false);
    expect(useAppStore.getState().changesStatusFilter.has('modified')).toBe(true);
  });

  it('restores the outline expansion per workspace', () => {
    expectPersistsAcrossRestart(
      'adl:changes.outlineExpanded',
      (value) =>
        useAppStore.getState().setChangesOutlineExpanded('workspace_a', value['workspace_a'] ?? []),
      () => hydrateAll().patch.changesOutlineExpanded,
      { workspace_a: ['hunk-1', 'file-x'] },
    );
  });

  it('restores the line-numbers toggle', () => {
    expectPersistsAcrossRestart(
      'adl:changes.lineNumbers',
      (value) => useAppStore.getState().setChangesLineNumbers(value),
      () => hydrateAll().patch.changesLineNumbers,
      false,
    );
  });

  it('restores the word-wrap toggle', () => {
    expectPersistsAcrossRestart(
      'adl:changes.wordWrap',
      (value) => useAppStore.getState().setChangesWordWrap(value),
      () => hydrateAll().patch.changesWordWrap,
      false,
    );
  });
});
