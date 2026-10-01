import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAppStore } from '@stores/slicedStore';
import { useBrowserPanelCloseHandlers } from './useBrowserPanelCloseHandlers';

function openPanelAndCenterTabs(): { panelId: string; centerId: string } {
  useAppStore.getState().browserOpenTab('https://panel.test', 'Panel');
  useAppStore.getState().browserOpenTab('https://center.test', 'Center');
  const tabs = useAppStore.getState().browserTabs;
  const panelId = tabs.find((t) => t.title === 'Panel')!.id;
  const centerId = tabs.find((t) => t.title === 'Center')!.id;
  useAppStore.getState().browserSetLocation(centerId, 'center');
  return { panelId, centerId };
}

function renderCloseHandlers() {
  const removeFromPool = vi.fn();
  const originalCloseAllTabs = vi.fn();
  const handleCloseTab = vi.fn();
  const originalClearTabDirectories = vi.fn();
  const { result } = renderHook(() =>
    useBrowserPanelCloseHandlers({
      handleCloseTab,
      originalCloseAllTabs,
      originalClearTabDirectories,
      removeFromPool,
    }),
  );
  return { result, removeFromPool, originalCloseAllTabs };
}

describe('useBrowserPanelCloseHandlers 批量关闭跳过中心标签', () => {
  beforeEach(() => {
    useAppStore.setState({
      browserTabs: [],
      browserTabsById: {},
      browserActiveTabId: '',
      isTauri: false,
    });
    document.body.innerHTML = '';
  });

  it('Tauri 模式只销毁面板标签的 WebView', () => {
    useAppStore.setState({ isTauri: true });
    const { panelId, centerId } = openPanelAndCenterTabs();
    const { result, removeFromPool } = renderCloseHandlers();

    act(() => result.current.handleCloseAllTabs());

    expect(removeFromPool).toHaveBeenCalledWith(panelId);
    expect(removeFromPool).not.toHaveBeenCalledWith(centerId);
  });

  it('非 Tauri 模式不触碰 WebView 池（卸载由 React 负责）', () => {
    useAppStore.setState({ isTauri: false });
    openPanelAndCenterTabs();
    const { result, removeFromPool } = renderCloseHandlers();

    act(() => result.current.handleCloseAllTabs());

    expect(removeFromPool).not.toHaveBeenCalled();
  });

  it('传 workspaceId 时不触碰任何 WebView', () => {
    useAppStore.setState({ isTauri: true });
    openPanelAndCenterTabs();
    const { result, removeFromPool } = renderCloseHandlers();

    act(() => result.current.handleCloseAllTabs('ws-1'));

    expect(removeFromPool).not.toHaveBeenCalled();
  });
});
