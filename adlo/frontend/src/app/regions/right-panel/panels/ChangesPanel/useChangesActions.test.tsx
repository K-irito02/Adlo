import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppStore } from '@stores/slicedStore';
import { useChangesActions } from './useChangesActions';
import type { UseChangesActionsParams } from './useChangesActions';

function baseParams(visibleWorkspaces: unknown[]): UseChangesActionsParams {
  return {
    editorRef: { current: null },
    changesPreviewContainerRef: { current: null },
    changePreview: undefined,
    previewEnabled: false,
    directoryPaths: [],
    hasExpandedDirectories: false,
    hasExpandableOutlineItems: false,
    hasExpandedOutlineItems: false,
    defaultExpandedOutlineIds: new Set(),
    setExpandedOutlineIds: vi.fn(),
    collapsedPatchHunkIds: [],
    onSelectPatchFile: vi.fn(),
    recentWorkspaces: visibleWorkspaces as never,
    visibleWorkspaces: visibleWorkspaces as never,
    activeWorkspaceId: undefined,
    collapseAllChangesTreePaths: vi.fn(),
    setChangesTreePathExpanded: vi.fn(),
    toggleChangesTreePath: vi.fn(),
  };
}

describe('useChangesActions onRefreshAll (事项 3)', () => {
  const refreshGitSnapshot = vi.fn(async () => {});
  const setRefreshingAllChanges = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(useAppStore, 'getState').mockReturnValue({
      setRefreshingAllChanges,
      refreshGitSnapshot,
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('覆盖全部可见工作区（不只展开项）', async () => {
    // collapsed 代表用户没有展开该工作区的变更树。
    const visible = [
      { id: 'ws-open', path: '/open', name: 'open', expanded: true },
      { id: 'ws-collapsed', path: '/collapsed', name: 'collapsed', expanded: false },
    ];
    const { result } = renderHook(() => useChangesActions(baseParams(visible)));

    await act(async () => {
      result.current.onRefreshAll();
    });

    expect(refreshGitSnapshot).toHaveBeenCalledTimes(2);
    expect(refreshGitSnapshot).toHaveBeenCalledWith('ws-open', '/open', expect.any(Object));
    expect(refreshGitSnapshot).toHaveBeenCalledWith(
      'ws-collapsed',
      '/collapsed',
      expect.any(Object),
    );
  });
});
