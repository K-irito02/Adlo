import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@stores/slicedStore';

const reset = () => useAppStore.setState({ centerTabs: [], centerActiveTabId: '' });

describe('centerTabsSlice', () => {
  beforeEach(reset);

  it('追加标签并激活', () => {
    const id = useAppStore.getState().centerAddTab('launcher', null);
    const s = useAppStore.getState();
    expect(s.centerTabs).toHaveLength(1);
    expect(s.centerTabs[0]).toMatchObject({ id, kind: 'launcher', refId: null });
    expect(s.centerActiveTabId).toBe(id);
  });

  it('select 切换活动标签', () => {
    const a = useAppStore.getState().centerAddTab('launcher', null);
    const b = useAppStore.getState().centerAddTab('browser', 'btab-1');
    useAppStore.getState().centerSelectTab(a);
    expect(useAppStore.getState().centerActiveTabId).toBe(a);
    useAppStore.getState().centerSelectTab(b);
    expect(useAppStore.getState().centerActiveTabId).toBe(b);
  });

  it('移除活动标签后激活最后一个', () => {
    const a = useAppStore.getState().centerAddTab('launcher', null);
    const b = useAppStore.getState().centerAddTab('browser', 'btab-1');
    useAppStore.getState().centerRemoveTab(b);
    expect(useAppStore.getState().centerActiveTabId).toBe(a);
    useAppStore.getState().centerRemoveTab(a);
    // spec §5 不变量：关闭最后一个中心标签后自动新建 launcher 并激活。
    const after = useAppStore.getState();
    expect(after.centerTabs).toHaveLength(1);
    expect(after.centerTabs[0].kind).toBe('launcher');
    expect(after.centerActiveTabId).toBe(after.centerTabs[0].id);
  });
});
