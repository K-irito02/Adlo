import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mocks = vi.hoisted(() => {
  const setOutline = vi.fn();
  const state = {
    appInfo: { currentWorkspace: { id: 'ws-1', path: '/repo' }, config: {} },
    selectedFilePath: 'doc.md',
    selectedFileWorkspaceId: 'ws-1',
    fileContent: '# saved\n',
    fileMedia: null,
    fileMediaLoading: false,
    fileOpenError: null,
    positioningPath: undefined,
    externalFileChange: undefined,
    outline: [],
    workspaceTrees: {},
    recentWorkspaces: [{ id: 'ws-1', path: '/repo', removedFromSidebar: false, available: true }],
    workspaceTreeExpandedInFileNav: {},
    workspaceTreeLoading: {},
    workspaceTreeErrors: {},
    searchQuery: '',
    searchEntries: [],
    dirtyEditorPaths: [],
    activePatchSet: undefined,
    latestPatchApplication: undefined,
    selectedPatchFilePath: undefined,
    setOutline,
  };
  const actions = new Proxy({} as Record<string, unknown>, {
    get: (_target, prop) => (prop === 'then' ? undefined : vi.fn()),
  });
  const peek = vi.fn((path: string, workspaceId?: string) =>
    path === 'doc.md' && workspaceId === 'ws-1' ? '# draft\n' : undefined,
  );
  return { state, setOutline, actions, peek };
});

vi.mock('@stores/slicedStore', () => ({
  useAppStore: Object.assign(
    (selector?: (state: unknown) => unknown) => (selector ? selector(mocks.state) : mocks.state),
    { getState: () => mocks.state },
  ),
}));

vi.mock('@hooks/useAppActions', () => ({
  useAppActions: () => mocks.actions,
}));

vi.mock('@stores/actions/editorActions', () => ({
  peekPendingEditorText: mocks.peek,
}));

import { useFilesPanelProps } from './useFilesPanelProps';

const panelProps = new Proxy({} as Record<string, unknown>, {
  get: () => vi.fn(),
});

describe('useFilesPanelProps 大纲跟手接线', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('打字停顿 400ms 后才把最新草稿写成大纲', async () => {
    const { result } = renderHook(() => useFilesPanelProps(panelProps as never, false, () => {}));

    act(() => {
      result.current.onEditorChange('# draft\n');
    });
    expect(mocks.setOutline).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(399);
    });
    expect(mocks.setOutline).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(mocks.setOutline).toHaveBeenCalledTimes(1);
    const outline = mocks.setOutline.mock.calls[0]?.[0] as { label: string }[];
    expect(outline.map((item) => item.label)).toEqual(['draft']);
    // 工作区必须随路径一起传给草稿读取（丢了会退回 global 键/旧基线）。
    expect(mocks.peek).toHaveBeenCalledWith('doc.md', 'ws-1');
  });
});
