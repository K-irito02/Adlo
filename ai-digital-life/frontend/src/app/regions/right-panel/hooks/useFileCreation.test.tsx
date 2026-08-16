import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { TCopyProvider } from '@i18n/TCopyContext';
import { useFileCreation, type UseFileCreationInput } from './useFileCreation';

const mockT = {
  fileNameRequired: 'Please enter a name to create the file or folder',
  fileNameEmpty: 'Please enter a name',
} as Record<string, string>;

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <TCopyProvider t={mockT as never} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

function makeInput(overrides: Partial<UseFileCreationInput> = {}): UseFileCreationInput {
  return {
    selectedFilePath: 'src/App.tsx',
    selectedFileWorkspaceId: 'ws-1',
    activeWorkspaceId: 'ws-1',
    recentWorkspaces: [{ id: 'ws-1', path: '/workspace-one' }],
    onCreateWorkspaceFile: async () => undefined,
    onCreateWorkspaceFolder: async () => undefined,
    expandFileTreePathChain: () => undefined,
    setFileTreePathExpanded: () => undefined,
    ...overrides,
  };
}

describe('useFileCreation default creation value', () => {
  it('does not pre-fill a path when starting a new file', () => {
    const { result } = renderHook(
      () =>
        useFileCreation(
          makeInput({
            clickedNode: { path: 'packages/foo', workspaceId: 'ws-1', kind: 'directory' },
          }),
        ),
      { wrapper },
    );

    act(() => result.current.startCreate('file'));

    expect(result.current.createPathValue).toBe('');
  });

  it('does not pre-fill a path when starting a new folder', () => {
    const { result } = renderHook(
      () =>
        useFileCreation(
          makeInput({
            clickedNode: { path: 'packages/foo/index.ts', workspaceId: 'ws-1', kind: 'file' },
          }),
        ),
      { wrapper },
    );

    act(() => result.current.startCreate('folder'));

    expect(result.current.createPathValue).toBe('');
  });
});

describe('useFileCreation submit target workspace', () => {
  it('creates in the selected workspace when one is active', async () => {
    const onCreateWorkspaceFile = vi.fn(async () => undefined);
    const { result } = renderHook(
      () =>
        useFileCreation(
          makeInput({
            selectedFilePath: undefined,
            activeWorkspaceId: 'ws-2',
            recentWorkspaces: [
              { id: 'ws-1', path: '/workspace-one' },
              { id: 'ws-2', path: '/workspace-two' },
            ],
            onCreateWorkspaceFile,
          }),
        ),
      { wrapper },
    );

    act(() => result.current.startCreate('file'));
    act(() => result.current.setCreatePathValue('foo.md'));
    await act(async () => {
      await result.current.submitCreate();
    });

    expect(onCreateWorkspaceFile).toHaveBeenCalledWith('foo.md', undefined, '/workspace-two');
  });

  it('anchors the created file to the clicked directory', async () => {
    const onCreateWorkspaceFile = vi.fn(async () => undefined);
    const { result } = renderHook(
      () =>
        useFileCreation(
          makeInput({
            selectedFilePath: undefined,
            activeWorkspaceId: 'ws-1',
            clickedNode: { path: 'packages/foo', workspaceId: 'ws-1', kind: 'directory' },
            onCreateWorkspaceFile,
          }),
        ),
      { wrapper },
    );

    act(() => result.current.startCreate('file'));
    act(() => result.current.setCreatePathValue('foo.md'));
    await act(async () => {
      await result.current.submitCreate();
    });

    expect(onCreateWorkspaceFile).toHaveBeenCalledWith(
      'packages/foo/foo.md',
      undefined,
      '/workspace-one',
    );
  });

  it('anchors the created file to the workspace root when the top-level dir is selected', async () => {
    const onCreateWorkspaceFile = vi.fn(async () => undefined);
    const { result } = renderHook(
      () =>
        useFileCreation(
          makeInput({
            selectedFilePath: 'src/App.tsx',
            activeWorkspaceId: 'ws-1',
            clickedWorkspaceRoot: 'ws-1',
            onCreateWorkspaceFile,
          }),
        ),
      { wrapper },
    );

    act(() => result.current.startCreate('file'));
    act(() => result.current.setCreatePathValue('foo.md'));
    await act(async () => {
      await result.current.submitCreate();
    });

    expect(onCreateWorkspaceFile).toHaveBeenCalledWith('foo.md', undefined, '/workspace-one');
  });

  it('creates in the clicked node workspace, not the globally active workspace', async () => {
    // 复现多工作区 bug：用户点击了 ws-2 顶级目录（高亮在 ws-2），但随后在 ws-1 的
    // 目录节点上操作。创建目标应落在 ws-1（点击节点所属工作区），而非全局激活的 ws-2。
    const onCreateWorkspaceFile = vi.fn(async () => undefined);
    const onCreateWorkspaceFolder = vi.fn(async () => 'docs/newdir');
    const expandFileTreePathChain = vi.fn();
    const setFileTreePathExpanded = vi.fn();
    const { result } = renderHook(
      () =>
        useFileCreation(
          makeInput({
            selectedFilePath: undefined,
            activeWorkspaceId: 'ws-2',
            recentWorkspaces: [
              { id: 'ws-1', path: '/workspace-one' },
              { id: 'ws-2', path: '/workspace-two' },
            ],
            clickedWorkspaceRoot: 'ws-2',
            clickedNode: { path: 'docs', workspaceId: 'ws-1', kind: 'directory' },
            onCreateWorkspaceFile,
            onCreateWorkspaceFolder,
            expandFileTreePathChain,
            setFileTreePathExpanded,
          }),
        ),
      { wrapper },
    );

    act(() => result.current.startCreate('folder'));
    act(() => result.current.setCreatePathValue('newdir'));
    await act(async () => {
      await result.current.submitCreate();
    });

    // 创建在 ws-1 的 docs 目录下，且展开/展开态都作用在 ws-1。
    expect(onCreateWorkspaceFolder).toHaveBeenCalledWith('docs/newdir', '/workspace-one');
    expect(expandFileTreePathChain).toHaveBeenCalledWith('ws-1', 'docs/newdir');
    expect(setFileTreePathExpanded).toHaveBeenCalledWith('ws-1', 'docs/newdir', true);
  });

  it('falls back to the first recent workspace when none is selected', async () => {
    const onCreateWorkspaceFile = vi.fn(async () => undefined);
    const { result } = renderHook(
      () =>
        useFileCreation(
          makeInput({
            selectedFilePath: undefined,
            activeWorkspaceId: undefined,
            recentWorkspaces: [
              { id: 'ws-1', path: '/workspace-one' },
              { id: 'ws-2', path: '/workspace-two' },
            ],
            onCreateWorkspaceFile,
          }),
        ),
      { wrapper },
    );

    act(() => result.current.startCreate('file'));
    act(() => result.current.setCreatePathValue('foo.md'));
    await act(async () => {
      await result.current.submitCreate();
    });

    expect(onCreateWorkspaceFile).toHaveBeenCalledWith('foo.md', undefined, '/workspace-one');
  });

  it('does not call the backend when the name is empty', async () => {
    const onCreateWorkspaceFile = vi.fn(async () => undefined);
    const { result } = renderHook(
      () =>
        useFileCreation(
          makeInput({
            selectedFilePath: undefined,
            activeWorkspaceId: 'ws-1',
            onCreateWorkspaceFile,
          }),
        ),
      { wrapper },
    );

    act(() => result.current.startCreate('file'));
    act(() => result.current.setCreatePathValue('   '));
    await act(async () => {
      await result.current.submitCreate();
    });

    expect(onCreateWorkspaceFile).not.toHaveBeenCalled();
  });

  it('does not call the backend when there is no workspace to create in', async () => {
    const onCreateWorkspaceFile = vi.fn(async () => undefined);
    const { result } = renderHook(
      () =>
        useFileCreation(
          makeInput({
            selectedFilePath: undefined,
            activeWorkspaceId: undefined,
            recentWorkspaces: [],
            onCreateWorkspaceFile,
          }),
        ),
      { wrapper },
    );

    act(() => result.current.startCreate('file'));
    act(() => result.current.setCreatePathValue('foo.md'));
    await act(async () => {
      await result.current.submitCreate();
    });

    expect(onCreateWorkspaceFile).not.toHaveBeenCalled();
  });

  it('does not anchor to the selected file parent when the file belongs to another workspace', async () => {
    // 边界场景：编辑器打开的文件在 ws-1，但目标工作区是 ws-2（无点击节点/顶级目录）。
    // 回退不应把文件锚定到 ws-1 的目录结构，而应落到 ws-2 工作区根目录，避免跨工作区路径污染。
    const onCreateWorkspaceFile = vi.fn(async () => undefined);
    const { result } = renderHook(
      () =>
        useFileCreation(
          makeInput({
            selectedFilePath: 'src/App.tsx',
            selectedFileWorkspaceId: 'ws-1',
            activeWorkspaceId: 'ws-2',
            recentWorkspaces: [
              { id: 'ws-1', path: '/workspace-one' },
              { id: 'ws-2', path: '/workspace-two' },
            ],
            onCreateWorkspaceFile,
          }),
        ),
      { wrapper },
    );

    act(() => result.current.startCreate('file'));
    act(() => result.current.setCreatePathValue('foo.md'));
    await act(async () => {
      await result.current.submitCreate();
    });

    expect(onCreateWorkspaceFile).toHaveBeenCalledWith('foo.md', undefined, '/workspace-two');
  });

  it('anchors to the selected file parent when the file belongs to the target workspace', async () => {
    const onCreateWorkspaceFile = vi.fn(async () => undefined);
    const { result } = renderHook(
      () =>
        useFileCreation(
          makeInput({
            selectedFilePath: 'src/App.tsx',
            selectedFileWorkspaceId: 'ws-1',
            activeWorkspaceId: 'ws-1',
            onCreateWorkspaceFile,
          }),
        ),
      { wrapper },
    );

    act(() => result.current.startCreate('file'));
    act(() => result.current.setCreatePathValue('foo.md'));
    await act(async () => {
      await result.current.submitCreate();
    });

    expect(onCreateWorkspaceFile).toHaveBeenCalledWith('src/foo.md', undefined, '/workspace-one');
  });
});
