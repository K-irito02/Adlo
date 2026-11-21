import { describe, expect, it } from 'vitest';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import { resolveNewWindowTabHost } from '../newWindowTabRouting';

function tab(id: string, location: 'center' | 'panel' | undefined): BrowserTabState {
  return {
    id,
    workspaceId: '',
    title: '',
    url: '',
    titleResolved: true,
    isPinned: false,
    sortOrder: 0,
    isPlayingAudio: false,
    isAudioMuted: false,
    isDownloading: false,
    ...(location ? { location } : {}),
  };
}

describe('resolveNewWindowTabHost', () => {
  it('routes a center tab request back to the center', () => {
    const centerTab = tab('center-browser', 'center');
    expect(resolveNewWindowTabHost(centerTab.id, { [centerTab.id]: centerTab }, [centerTab])).toBe(
      'center',
    );
  });

  it('keeps a panel tab request in the panel', () => {
    const panelTab = tab('panel-browser', undefined);
    expect(resolveNewWindowTabHost(panelTab.id, { [panelTab.id]: panelTab }, [panelTab])).toBe(
      'panel',
    );
  });

  it('falls back to the panel when the source tab is unknown', () => {
    expect(resolveNewWindowTabHost('missing', {}, [])).toBe('panel');
  });
});
