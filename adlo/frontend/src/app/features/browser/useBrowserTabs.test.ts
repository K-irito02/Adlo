import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAppStore } from '@stores/slicedStore';
import { useBrowserTabs } from './useBrowserTabs';

function resetStore() {
  useAppStore.setState({
    browserTabs: [],
    browserTabsById: {},
    browserActiveTabId: '',
    browserBookmarks: [],
    browserBookmarkFolders: [],
    browserWorkspaceBookmarks: {},
  });
}

function seedActiveTab(url: string, title: string): string {
  useAppStore.getState().browserOpenTab(url, title, 'ws-1');
  const tab = useAppStore.getState().browserTabs.find((candidate) => candidate.url === url);
  expect(tab).toBeDefined();
  useAppStore.setState({ browserActiveTabId: tab!.id });
  return tab!.id;
}

describe('useBrowserTabs isBookmarked 按 URL 判定', () => {
  beforeEach(resetStore);

  it('导入书签标题与当前页面标题不同时仍显示为已收藏', () => {
    // 外部导入 / 「仅保存」的书签保留导入时的快照标题；打开后标签标题来自页面，
    // 本用例中两者不同，收藏状态不能因此丢失。
    seedActiveTab('https://imported.example/page', '页面真实标题');
    useAppStore.setState({
      browserBookmarks: [{ url: 'https://imported.example/page', title: '导入时的标题' }],
    });

    const { result } = renderHook(() => useBrowserTabs());

    expect(result.current.isBookmarked).toBe(true);
  });

  it('URL 归一化后一致（尾斜杠 / www）也视为已收藏', () => {
    seedActiveTab('https://imported.example/page', '页面真实标题');
    useAppStore.setState({
      browserBookmarks: [{ url: 'https://www.imported.example/page/', title: '导入时的标题' }],
    });

    const { result } = renderHook(() => useBrowserTabs());

    expect(result.current.isBookmarked).toBe(true);
  });

  it('同主机不同端口/协议不视为同一收藏', () => {
    seedActiveTab('https://localhost:5173/app', '本地应用');
    useAppStore.setState({
      browserBookmarks: [{ url: 'http://localhost:3000/app', title: '另一个本地应用' }],
    });

    const { result } = renderHook(() => useBrowserTabs());

    expect(result.current.isBookmarked).toBe(false);
  });

  it('未收藏的 URL 保持空心状态（反向守护）', () => {
    seedActiveTab('https://not-bookmarked.example/page', '页面');
    useAppStore.setState({
      browserBookmarks: [{ url: 'https://another.example/', title: '另一条' }],
    });

    const { result } = renderHook(() => useBrowserTabs());

    expect(result.current.isBookmarked).toBe(false);
  });
});
