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

describe('useBrowserFolderCrud 目录批量与删除动作', () => {
  beforeEach(() => {
    useAppStore.setState({
      browserTabs: [],
      browserTabsById: {},
      browserActiveTabId: '',
      browserBookmarkFolders: [],
      browserWorkspaceBookmarks: {},
      browserBookmarks: [],
      browserHistory: [],
      centerTabs: [],
      centerActiveTabId: '',
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

  it('handleOpenAllInCenter 把目录下全部书签打开到中心', () => {
    useAppStore.setState({
      browserBookmarkFolders: [
        {
          id: 'f1',
          name: 'F',
          createdAt: 0,
          entries: [
            { id: 'b1', url: 'https://a.test', title: 'A', addedAt: 0, lastModifiedAt: 0 },
            { id: 'b2', url: 'https://b.test', title: 'B', addedAt: 0, lastModifiedAt: 0 },
          ],
        },
        {
          id: 'f2',
          name: 'Sub',
          createdAt: 0,
          parentId: 'f1',
          parentType: 'folder',
          entries: [{ id: 'b3', url: 'https://c.test', title: 'C', addedAt: 0, lastModifiedAt: 0 }],
        },
      ],
    });
    const { result } = renderHook(() => useBrowserFolderCrud());

    act(() => result.current.handleOpenAllInCenter('userFolder', 'folder:f1'));

    const state = useAppStore.getState();
    const centerUrls = state.browserTabs
      .filter((tab) => tab.location === 'center')
      .map((tab) => tab.url)
      .sort();
    expect(centerUrls).toEqual(['https://a.test', 'https://b.test', 'https://c.test']);
    expect(state.centerTabs).toHaveLength(3);
  });

  it('handleOpenAllInCenter 工作区：同 URL 去重并包含工作区目录内书签', () => {
    useAppStore.getState().browserOpenTab('https://dup.test/page', 'Dup', 'ws-1');
    useAppStore.setState({
      browserWorkspaceBookmarks: {
        'ws-1': [
          {
            id: 'wb1',
            url: 'https://dup.test/page',
            title: 'Dup snapshot',
            addedAt: 0,
            lastModifiedAt: 0,
          },
          { id: 'wb2', url: 'https://root.test/', title: 'Root', addedAt: 0, lastModifiedAt: 0 },
        ],
      },
      browserBookmarkFolders: [
        {
          id: 'wsf',
          name: '工作区目录',
          createdAt: 0,
          parentId: 'ws-1',
          parentType: 'workspace',
          entries: [
            { id: 'b4', url: 'https://child.test/', title: 'Child', addedAt: 0, lastModifiedAt: 0 },
          ],
        },
      ],
    });
    const { result } = renderHook(() => useBrowserFolderCrud());

    act(() => result.current.handleOpenAllInCenter('workspace', 'workspace:ws-1'));

    const state = useAppStore.getState();
    const centerUrls = state.browserTabs
      .filter((tab) => tab.location === 'center')
      .map((tab) => tab.url)
      .sort();
    expect(centerUrls).toEqual([
      'https://child.test/',
      'https://dup.test/page',
      'https://root.test/',
    ]);
    expect(state.centerTabs).toHaveLength(3);
  });

  it('handleOpenAllInCenter 历史日：按 URL 去重后打开', () => {
    const visitedAt = Date.now();
    const d = new Date(visitedAt);
    const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    useAppStore.setState({
      browserHistory: [
        { id: 'h1', url: 'https://h.test/a', title: 'A', visitedAt },
        { id: 'h2', url: 'https://h.test/a', title: 'A again', visitedAt },
        { id: 'h3', url: 'https://h.test/b', title: 'B', visitedAt },
      ],
    });
    const { result } = renderHook(() => useBrowserFolderCrud());

    act(() => result.current.handleOpenAllInCenter('history', `history:day:${dayKey}`));

    const centerUrls = useAppStore
      .getState()
      .browserTabs.filter((tab) => tab.location === 'center')
      .map((tab) => tab.url)
      .sort();
    expect(centerUrls).toEqual(['https://h.test/a', 'https://h.test/b']);
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
