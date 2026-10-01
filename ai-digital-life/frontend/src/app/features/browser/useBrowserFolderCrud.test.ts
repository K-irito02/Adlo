import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAppStore } from '@stores/slicedStore';
import { useBrowserFolderCrud } from './useBrowserFolderCrud';

function seedWorkspaceTabs(): { panelId: string; centerId: string } {
  const open = useAppStore.getState().browserOpenTab;
  open('https://panel.test', 'Panel', 'ws-1');
  open('https://center.test', 'Center', 'ws-1');
  const tabs = useAppStore.getState().browserTabs;
  const panelId = tabs.find((t) => t.title === 'Panel')!.id;
  const centerId = tabs.find((t) => t.title === 'Center')!.id;
  useAppStore.getState().browserSetLocation(centerId, 'center');
  useAppStore.setState({
    browserBookmarkTabIdUrlMap: {
      [panelId]: 'https://panel.test',
      [centerId]: 'https://center.test',
    },
  });
  return { panelId, centerId };
}

describe('useBrowserFolderCrud 树删除跳过中心标签书签', () => {
  beforeEach(() => {
    useAppStore.setState({
      browserTabs: [],
      browserTabsById: {},
      browserActiveTabId: '',
      browserTabFolders: [],
      browserWorkspaceBookmarks: {},
      browserBookmarkTabIdUrlMap: {},
      browserBookmarks: [],
      browserHistory: [],
    });
  });

  it('handleDeleteAllChildTabs 不清除存活中心标签的书签映射', () => {
    const { panelId, centerId } = seedWorkspaceTabs();
    const { result } = renderHook(() => useBrowserFolderCrud());

    act(() => result.current.handleDeleteAllChildTabs('', 'workspace:ws-1'));

    const s = useAppStore.getState();
    expect(s.browserBookmarkTabIdUrlMap[centerId]).toBe('https://center.test');
    expect(s.browserBookmarkTabIdUrlMap[panelId]).toBeUndefined();
    expect(s.browserTabs.some((t) => t.id === centerId)).toBe(true);
    expect(s.browserTabs.some((t) => t.id === panelId)).toBe(false);
  });

  it('handleDeleteOwnChildTabs 不清除存活中心标签的书签映射', () => {
    const { panelId, centerId } = seedWorkspaceTabs();
    const { result } = renderHook(() => useBrowserFolderCrud());

    act(() => result.current.handleDeleteOwnChildTabs('', 'workspace:ws-1'));

    const s = useAppStore.getState();
    expect(s.browserBookmarkTabIdUrlMap[centerId]).toBe('https://center.test');
    expect(s.browserBookmarkTabIdUrlMap[panelId]).toBeUndefined();
    expect(s.browserTabs.some((t) => t.id === centerId)).toBe(true);
    expect(s.browserTabs.some((t) => t.id === panelId)).toBe(false);
  });

  it('handleDeleteDirectory 不清除存活中心标签的书签映射', () => {
    const { panelId, centerId } = seedWorkspaceTabs();
    useAppStore.setState({
      browserTabFolders: [
        {
          id: 'f1',
          name: 'F',
          createdAt: 1,
          tabs: [
            { tabId: panelId, url: 'https://panel.test', title: 'Panel' },
            { tabId: centerId, url: 'https://center.test', title: 'Center' },
          ],
        },
      ],
    });
    const { result } = renderHook(() => useBrowserFolderCrud());

    act(() => result.current.handleDeleteDirectory('folder:f1'));

    const s = useAppStore.getState();
    expect(s.browserBookmarkTabIdUrlMap[centerId]).toBe('https://center.test');
    expect(s.browserBookmarkTabIdUrlMap[panelId]).toBeUndefined();
  });
});
