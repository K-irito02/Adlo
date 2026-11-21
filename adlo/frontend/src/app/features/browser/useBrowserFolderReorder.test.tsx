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
});
