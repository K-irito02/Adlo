import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAppStore } from '@stores/slicedStore';
import { useBrowserTabs } from '../useBrowserTabs';
import { useBrowserPanelState } from '../useBrowserPanelState';
import type { BrowserTabState } from '@stores/slices/browserSlice';

function makeTab(id: string, patch: Partial<BrowserTabState> = {}): BrowserTabState {
  return {
    id,
    workspaceId: '',
    title: id,
    url: `https://${id}.test`,
    titleResolved: true,
    isPinned: false,
    sortOrder: 0,
    isPlayingAudio: false,
    isAudioMuted: false,
    isDownloading: false,
    ...patch,
  };
}

describe('面板浏览器列表/计数排除中心标签', () => {
  beforeEach(() => {
    useAppStore.setState({
      browserTabs: [],
      browserTabsById: {},
      browserActiveTabId: '',
      browserBookmarks: [],
    });
  });

  it('转入中心的浏览器标签不出现在面板列表与活动标签中', () => {
    const panel = makeTab('panel', { location: 'panel' });
    const center = makeTab('center', { location: 'center' });
    useAppStore.setState({
      browserTabs: [panel, center],
      browserTabsById: { panel, center },
      browserActiveTabId: 'center',
    });

    const { result } = renderHook(() => useBrowserTabs());

    expect(result.current.browserTabs.map((t) => t.id)).toEqual(['panel']);
    expect(result.current.activeTab?.id).toBe('panel');
  });

  it('openTabCount 只统计面板标签', () => {
    const panel = makeTab('panel', { location: 'panel' });
    const center = makeTab('center', { location: 'center' });
    const { result } = renderHook(() =>
      useBrowserPanelState(
        {
          browserTabs: [panel, center],
          t: {} as never,
          activeTab: undefined,
          validatedUrlsRef: { current: new Set<string>() },
          iframeBlockedDetected: false,
          iframeLoadError: false,
        } as never,
        [],
      ),
    );

    expect(result.current.openTabCount).toBe(1);
  });
});
