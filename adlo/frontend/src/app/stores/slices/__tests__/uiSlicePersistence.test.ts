import { describe, it, expect, beforeEach } from 'vitest';
import { persistField } from '@stores/persisted/apply';
import { hydrateAll, resetHydrationForTest } from '@stores/persisted/hydrate';
import { flushCrossSliceWrites } from '@stores/storageHelpers';

describe('uiSlice persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHydrationForTest();
  });

  it('restores filesNavigatorMode after a simulated restart', () => {
    const patch = persistField('adl:files.navigatorMode', 'search');
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(patch).toEqual({ filesNavigatorMode: 'search' });
    expect(hydrateAll().patch.filesNavigatorMode).toBe('search');
  });

  it('restores leftPanelWidth after a simulated restart', () => {
    persistField('adl:ui.leftPanelWidth', 220);
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.leftbarWidth).toBe(220);
  });

  it('clamps an out-of-range persisted width on hydration', () => {
    localStorage.setItem('adl:ui.leftPanelWidth', '9999');
    expect(hydrateAll().patch.leftbarWidth).toBe(260);
  });

  it('restores navigatorCollapsedByTool', () => {
    persistField('adl:ui.navigatorCollapsed', { files: true, changes: false } as never);
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.navigatorCollapsedByTool).toEqual({ files: true, changes: false });
  });
});
