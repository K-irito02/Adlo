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
  return { panelId, centerId };
}

describe('useBrowserFolderCrud 树删除跳过中心标签', () => {
  beforeEach(() => {
    useAppStore.setState({
      browserTabs: [],
      browserTabsById: {},
      browserActiveTabId: '',
      browserBookmarkFolders: [],
      browserWorkspaceBookmarks: {},
      browserBookmarks: [],
      browserHistory: [],
    });
  });

  it('handleDeleteAllChildTabs 关闭工作区面板标签、保留中心标签', () => {
    const { panelId, centerId } = seedWorkspaceTabs();
    const { result } = renderHook(() => useBrowserFolderCrud());

    act(() => result.current.handleDeleteAllChildTabs('', 'workspace:ws-1'));

    const s = useAppStore.getState();
    expect(s.browserTabs.some((t) => t.id === centerId)).toBe(true);
    expect(s.browserTabs.some((t) => t.id === panelId)).toBe(false);
  });

  it('handleDeleteOwnChildTabs 关闭工作区面板标签、保留中心标签', () => {
    const { panelId, centerId } = seedWorkspaceTabs();
    const { result } = renderHook(() => useBrowserFolderCrud());

    act(() => result.current.handleDeleteOwnChildTabs('', 'workspace:ws-1'));

    const s = useAppStore.getState();
    expect(s.browserTabs.some((t) => t.id === centerId)).toBe(true);
    expect(s.browserTabs.some((t) => t.id === panelId)).toBe(false);
  });

  it('handleDeleteDirectory 只清空该目录的书签，不关闭任何标签', () => {
    const { panelId, centerId } = seedWorkspaceTabs();
    useAppStore.setState({
      browserBookmarkFolders: [
        {
          id: 'f1',
          name: 'F',
          createdAt: 1,
          entries: [
            {
              id: 'bm-panel',
              sourceTabId: panelId,
              url: 'https://panel.test',
              title: 'Panel',
              addedAt: 1,
              lastModifiedAt: 1,
            },
            {
              id: 'bm-center',
              sourceTabId: centerId,
              url: 'https://center.test',
              title: 'Center',
              addedAt: 1,
              lastModifiedAt: 1,
            },
          ],
        },
      ],
    });
    const { result } = renderHook(() => useBrowserFolderCrud());

    act(() => result.current.handleDeleteDirectory('folder:f1'));

    const s = useAppStore.getState();
    // 书签是独立实体：删目录只清书签，标签页一律不动
    expect(s.browserBookmarkFolders).toHaveLength(0);
    expect(s.browserTabs).toHaveLength(2);
  });
});
