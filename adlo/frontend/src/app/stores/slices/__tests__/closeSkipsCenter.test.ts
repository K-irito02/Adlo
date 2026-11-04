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

  it('browserCloseAllTabs 仅剩中心标签时面板活动标签清空', () => {
    useAppStore.getState().browserOpenTab('https://a.test', 'A');
    useAppStore.getState().browserOpenTab('https://b.test', 'B');
    const [a, b] = useAppStore.getState().browserTabs.map((t) => t.id);
    useAppStore.getState().browserSetLocation(a, 'center');
    useAppStore.getState().browserSelectTab(b);
    useAppStore.getState().browserCloseAllTabs();
    const s = useAppStore.getState();
    // 中心标签保留，但回退只取面板标签：无面板标签则清空，不得指向中心标签。
    expect(s.browserTabs).toHaveLength(1);
    expect(s.browserTabs[0].id).toBe(a);
    expect(s.browserActiveTabId).toBe('');
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

  it('terminalCloseAllTabs 仅剩中心标签时面板活动标签清空', () => {
    useAppStore.getState().terminalCreateTab('powershell', 'ws-1');
    useAppStore.getState().terminalCreateTab('bash', 'ws-1');
    const [a, b] = useAppStore.getState().terminalTabs.map((t) => t.id);
    useAppStore.getState().terminalSetLocation(a, 'center');
    useAppStore.getState().terminalSelectTab(b);
    useAppStore.getState().terminalCloseAllTabs();
    const s = useAppStore.getState();
    expect(s.terminalTabs).toHaveLength(1);
    expect(s.terminalTabs[0].id).toBe(a);
    expect(s.terminalActiveTabId).toBe('');
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

  it('browserCloseTab 关闭最后一个面板标签时不回退到中心标签（事项 6）', () => {
    useAppStore.getState().browserOpenTab('https://c.test', 'C');
    useAppStore.getState().browserOpenTab('https://p.test', 'P');
    const [c, p] = useAppStore.getState().browserTabs.map((t) => t.id);
    useAppStore.getState().browserSetLocation(c, 'center');
    useAppStore.getState().browserSelectTab(p);
    useAppStore.getState().browserCloseTab(p);
    const s = useAppStore.getState();
    expect(s.browserTabs.some((t) => t.id === c)).toBe(true);
    expect(s.browserActiveTabId).toBe('');
  });

  it('browserCloseTab 回退取最后一个面板标签而非中心标签', () => {
    useAppStore.getState().browserOpenTab('https://a.test', 'A');
    useAppStore.getState().browserOpenTab('https://b.test', 'B');
    useAppStore.getState().browserOpenTab('https://c.test', 'C');
    const [a, b, c] = useAppStore.getState().browserTabs.map((t) => t.id);
    useAppStore.getState().browserSetLocation(c, 'center');
    useAppStore.getState().browserSelectTab(b);
    useAppStore.getState().browserCloseTab(b);
    const s = useAppStore.getState();
    expect(s.browserActiveTabId).toBe(a);
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
