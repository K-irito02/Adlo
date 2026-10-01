import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@stores/slicedStore';

describe('centerActions', () => {
  beforeEach(() => {
    useAppStore.setState({
      centerTabs: [],
      centerActiveTabId: '',
      browserTabs: [],
      browserActiveTabId: '',
    });
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

  it('centerShowBrowserTab 重复同一标签只选中已有中心标签，不新增', () => {
    useAppStore.getState().browserOpenTab('https://a.test', 'A');
    const id = useAppStore.getState().browserTabs[0].id;
    useAppStore.getState().centerShowBrowserTab(id);
    const afterFirst = useAppStore.getState().centerTabs;
    const centerId = afterFirst.find((t) => t.kind === 'browser' && t.refId === id)!.id;

    useAppStore.getState().centerShowBrowserTab(id);

    const s = useAppStore.getState();
    expect(s.centerTabs.filter((t) => t.kind === 'browser' && t.refId === id)).toHaveLength(1);
    expect(s.centerTabs).toHaveLength(afterFirst.length);
    expect(s.centerActiveTabId).toBe(centerId);
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

  it('centerShowBrowserTab 对不存在的标签直接返回（不创建中心标签）', () => {
    useAppStore.getState().browserOpenTab('https://a.test', 'A');
    const before = useAppStore.getState().centerTabs.length;
    useAppStore.getState().centerShowBrowserTab('browser-gone');
    const s = useAppStore.getState();
    expect(s.centerTabs).toHaveLength(before);
    expect(s.browserTabs.some((t) => t.location === 'center')).toBe(false);
  });

  it('centerShowTerminalTab 对不存在的标签直接返回（不创建中心标签）', () => {
    useAppStore.getState().terminalCreateTab('powershell', '');
    const before = useAppStore.getState().centerTabs.length;
    useAppStore.getState().centerShowTerminalTab('terminal-gone');
    const s = useAppStore.getState();
    expect(s.centerTabs).toHaveLength(before);
    expect(s.terminalTabs.some((t) => t.location === 'center')).toBe(false);
  });

  it('centerReturnToPanel 底层浏览器标签已删除时只摘除中心标签并重夹面板活动标签', () => {
    useAppStore.getState().browserOpenTab('https://a.test', 'A');
    useAppStore.getState().browserOpenTab('https://b.test', 'B');
    const [a, b] = useAppStore.getState().browserTabs.map((t) => t.id);
    useAppStore.getState().centerShowBrowserTab(a);
    const centerTab = useAppStore.getState().centerTabs.find((t) => t.refId === a)!;
    // 底层标签先被删（中心标签悬空），再移回面板：不得抛错，不得写已删标签。
    useAppStore.getState().browserCloseTab(a);
    useAppStore.getState().centerReturnToPanel(centerTab.id);

    const s = useAppStore.getState();
    expect(s.centerTabs.some((t) => t.id === centerTab.id)).toBe(false);
    expect(s.browserTabsById[a]).toBeUndefined();
    // 面板活动标签被重夹到存活的面板标签。
    expect(s.browserActiveTabId).toBe(b);
  });

  it('centerReturnToPanel 底层终端标签已删除时只摘除中心标签并重夹面板活动标签', () => {
    const countBefore = useAppStore.getState().terminalTabs.length;
    useAppStore.getState().terminalCreateTab('powershell', '');
    useAppStore.getState().terminalCreateTab('bash', '');
    const [a, b] = useAppStore
      .getState()
      .terminalTabs.slice(countBefore)
      .map((t) => t.id);
    useAppStore.getState().centerShowTerminalTab(a);
    const centerTab = useAppStore.getState().centerTabs.find((t) => t.refId === a)!;
    useAppStore.getState().terminalCloseTab(a);
    useAppStore.getState().centerReturnToPanel(centerTab.id);

    const s = useAppStore.getState();
    expect(s.centerTabs.some((t) => t.id === centerTab.id)).toBe(false);
    expect(s.terminalTabsById[a]).toBeUndefined();
    expect(s.terminalActiveTabId).toBe(b);
  });
});
