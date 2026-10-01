import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@stores/slicedStore';

describe('centerActions', () => {
  beforeEach(() => {
    useAppStore.setState({ centerTabs: [], centerActiveTabId: '', browserTabs: [], browserActiveTabId: '' });
  });

  it('centerShowBrowserTab 移动标签到中心并重夹面板活动标签', () => {
    useAppStore.getState().browserOpenTab('https://a.test', 'A');
    useAppStore.getState().browserOpenTab('https://b.test', 'B');
    const first = useAppStore.getState().browserTabs[0].id;
    useAppStore.getState().browserSelectTab(first);
    useAppStore.getState().centerShowBrowserTab(first);

    const s = useAppStore.getState();
    expect(s.browserTabsById[first].location).toBe('center');
    expect(s.centerTabs.some((t) => t.kind === 'browser' && t.refId === first)).toBe(true);
    expect(s.browserActiveTabId).not.toBe(first);
  });

  it('centerReturnToPanel 把标签移回面板', () => {
    useAppStore.getState().browserOpenTab('https://a.test', 'A');
    const id = useAppStore.getState().browserTabs[0].id;
    useAppStore.getState().centerShowBrowserTab(id);
    const centerTab = useAppStore.getState().centerTabs.find((t) => t.refId === id)!;
    useAppStore.getState().centerReturnToPanel(centerTab.id);

    const s = useAppStore.getState();
    expect(s.browserTabsById[id].location).toBe('panel');
    // spec §5 不变量：移走最后一个中心标签后自动补一个 launcher。
    expect(s.centerTabs).toHaveLength(1);
    expect(s.centerTabs[0].kind).toBe('launcher');
    expect(s.browserActiveTabId).toBe(id);
  });
});
