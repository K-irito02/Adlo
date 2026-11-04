import { describe, it, expect, beforeEach } from 'vitest';
import { stubStorage, expectPersistsAcrossRestart } from '@stores/persisted/__tests__/helpers';
import { useAppStore } from '@stores/slicedStore';
import { hydrateAll } from '@stores/persisted/hydrate';

describe('browser panel sub-state persistence', () => {
  beforeEach(() => {
    stubStorage();
  });

  it('restores the navigator mode', () => {
    expectPersistsAcrossRestart(
      'adl:browser.navigatorMode',
      (value) => useAppStore.getState().setBrowserNavigatorMode(value),
      () => hydrateAll().patch.browserNavigatorMode,
      'search',
    );
  });

  it('restores the navigator search scope', () => {
    expectPersistsAcrossRestart(
      'adl:browser.searchScope',
      (value) => useAppStore.getState().setBrowserSearchScope(value),
      () => hydrateAll().patch.browserSearchScope,
      'history',
    );
  });

  it('restores the selected tree path', () => {
    expectPersistsAcrossRestart(
      'adl:browser.selectedTreePath',
      (value) => useAppStore.getState().setBrowserSelectedTreePath(value),
      () => hydrateAll().patch.browserSelectedTreePath,
      'workspace:ws-1/src',
    );
  });

  it('keeps clearing the tree selection (outside click still persists null)', async () => {
    const { flushCrossSliceWrites } = await import('@stores/storageHelpers');
    stubStorage();
    const state = useAppStore.getState();
    state.setBrowserSelectedTreePath('workspace:ws-1/src');
    state.setBrowserSelectedTreePath(null);
    flushCrossSliceWrites();
    expect(localStorage.getItem('adl:browser.selectedTreePath')).toBe('null');
  });

  it('stores zoom per tab without affecting other tabs', () => {
    expectPersistsAcrossRestart(
      'adl:browser.zoomByTab',
      (value) => useAppStore.getState().setBrowserZoomByTab('tab-1', value['tab-1'] ?? 1),
      () => hydrateAll().patch.browserZoomByTab,
      { 'tab-1': 1.5 },
    );
  });
});
