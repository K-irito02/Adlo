import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import { stripWorkspaceFromBrowserState } from '@stores/actions/browserCleanupHelpers';
import type { BrowserTabState } from '@stores/slices/browserTabsSlice';

describe('破坏性操作跳过中心标签', () => {
  beforeEach(() =>
    useAppStore.setState({
      browserTabs: [],
      browserActiveTabId: '',
      terminalTabs: [],
      terminalActiveTabId: '',
      centerTabs: [],
      centerActiveTabId: '',
    }),
  );

  it('browserCloseAllTabs 不关闭中心标签', () => {
    useAppStore.getState().browserOpenTab('https://a.test', 'A');
    useAppStore.getState().browserOpenTab('https://b.test', 'B');
    const [a, b] = useAppStore.getState().browserTabs.map((t) => t.id);
    useAppStore.getState().browserSetLocation(a, 'center');
    useAppStore.getState().browserCloseAllTabs();
    const s = useAppStore.getState();
    expect(s.browserTabs.some((t) => t.id === a)).toBe(true);
    expect(s.browserTabs.some((t) => t.id === b)).toBe(false);
  });

  it('terminalCloseAllTabs 不关闭中心标签', () => {
    useAppStore.getState().terminalCreateTab('powershell', 'ws-1');
    useAppStore.getState().terminalCreateTab('bash', 'ws-1');
    const [a, b] = useAppStore.getState().terminalTabs.map((t) => t.id);
    useAppStore.getState().terminalSetLocation(a, 'center');
    useAppStore.getState().terminalCloseAllTabs();
    const s = useAppStore.getState();
    expect(s.terminalTabs.some((t) => t.id === a)).toBe(true);
    expect(s.terminalTabs.some((t) => t.id === b)).toBe(false);
  });

  it('browserDeleteAllTabsInNode 不删除工作区内的中心标签', () => {
    useAppStore.getState().browserOpenTab('https://a.test', 'A', 'ws-1');
    useAppStore.getState().browserOpenTab('https://b.test', 'B', 'ws-1');
    const [a, b] = useAppStore.getState().browserTabs.map((t) => t.id);
    useAppStore.getState().browserSetLocation(a, 'center');
    useAppStore.getState().browserDeleteAllTabsInNode('workspace:ws-1');
    const s = useAppStore.getState();
    expect(s.browserTabs.some((t) => t.id === a)).toBe(true);
    expect(s.browserTabs.some((t) => t.id === b)).toBe(false);
  });

  it('移除工作区时保留中心标签', () => {
    const makeTab = (id: string, location?: 'panel' | 'center'): BrowserTabState => ({
      id,
      workspaceId: 'ws-1',
      title: id,
      url: `https://${id}.test`,
      titleResolved: true,
      isPinned: false,
      sortOrder: 0,
      isPlayingAudio: false,
      isAudioMuted: false,
      isDownloading: false,
      location,
    });
    const result = stripWorkspaceFromBrowserState(
      'ws-1',
      [makeTab('a', 'center'), makeTab('b')],
      [],
      '',
    );
    expect(result.browserTabs.some((t) => t.id === 'a')).toBe(true);
    expect(result.browserTabs.some((t) => t.id === 'b')).toBe(false);
  });
});
