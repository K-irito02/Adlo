import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppStore } from '@stores/slicedStore';
import { useBrowserFolderReorder } from './useBrowserFolderReorder';

describe('useBrowserFolderReorder history root', () => {
  const originalExpandAll = useAppStore.getState().browserExpandAllTreePaths;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    useAppStore.setState({
      browserExpandAllTreePaths: originalExpandAll,
      recentWorkspaces: [],
      browserBookmarkFolders: [],
      browserHistory: [],
      browserTabTreeExpanded: {},
    });
  });

  it('空历史也把 history:root 纳入「全部展开」', () => {
    const expandAll = vi.fn();
    useAppStore.setState({
      browserExpandAllTreePaths: expandAll,
      recentWorkspaces: [],
      browserBookmarkFolders: [],
      browserHistory: [],
    });
    const { result } = renderHook(() => useBrowserFolderReorder());

    act(() => {
      result.current.handleExpandAllTree();
    });

    expect(expandAll).toHaveBeenCalledWith(['history:root']);
  });

  it('非空历史折叠时 allTreeExpanded 为 false', () => {
    useAppStore.setState({
      recentWorkspaces: [],
      browserBookmarkFolders: [],
      browserHistory: [{ id: 'h1', url: 'https://a', title: 'a', visitedAt: 1 }] as never,
      browserTabTreeExpanded: { 'history:root': false },
    });
    const { result } = renderHook(() => useBrowserFolderReorder());

    expect(result.current.allTreeExpanded).toBe(false);
  });

  it('空历史被强制展开时不再参与 allTreeExpanded 判定', () => {
    useAppStore.setState({
      recentWorkspaces: [],
      browserBookmarkFolders: [{ id: 'f1', name: 'f', parentId: undefined }] as never,
      browserHistory: [],
      // 历史曾持久化为折叠，但空历史视觉上强制展开；其余条目已展开 → 全部展开。
      browserTabTreeExpanded: { 'history:root': false, 'folder:f1': true },
    });
    const { result } = renderHook(() => useBrowserFolderReorder());

    expect(result.current.allTreeExpanded).toBe(true);
  });
});
