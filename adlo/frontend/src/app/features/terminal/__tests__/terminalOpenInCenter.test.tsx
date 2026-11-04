import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTerminalContextMenu } from '../useTerminalContextMenu';
import { useAppStore } from '@stores/slicedStore';

describe('useTerminalContextMenu.openInCenter', () => {
  beforeEach(() => {
    useAppStore.setState({ centerTabs: [], centerActiveTabId: '' });
    // 真实终端标签：centerShowTerminalTab 的 ById 守卫要求 refId 真实存在，
    // 不再接受 store 之外的伪造 id。
    useAppStore.setState({ terminalTabs: [], terminalTabsById: {}, terminalActiveTabId: '' });
    useAppStore.getState().terminalCreateTab('powershell', '');
  });
  it('把标签移到中心', () => {
    const tabId = useAppStore.getState().terminalTabs[0].id;
    const tabs = useAppStore.getState().terminalTabs;
    const { result } = renderHook(() =>
      useTerminalContextMenu(
        tabs,
        () => {},
        () => {},
        () => {},
      ),
    );
    act(() => result.current.setContextMenu({ open: true, x: 0, y: 0, tabId, isPinned: false }));
    act(() => result.current.handleOpenInCenterFromMenu());
    expect(useAppStore.getState().centerTabs.some((t) => t.refId === tabId)).toBe(true);
  });
});
