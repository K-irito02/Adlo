import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import type { WorkspaceTreeNode } from '@shared/ipc';
import type { CopyDict } from '@app/i18n/types';
import { useAppStore } from '@stores/slicedStore';
import { useFileContextMenuItems } from '@regions/right-panel/hooks/useFileContextMenuItems';
import { TCopyProvider } from '@i18n/TCopyContext';
import { useWorkspaceChangesActions } from './WorkspaceChangesActions';

const mockT = {
  fileContextOpenWith: 'Open in Files',
  fileContextReveal: 'Reveal in file manager',
  fileContextRevealDir: 'Reveal directory in file manager',
  fileContextCopyFullPath: 'Copy full path',
  fileContextCopyRelativePath: 'Copy relative path',
  fileContextCut: 'Cut',
  fileContextCopy: 'Copy',
  fileContextPaste: 'Paste',
  fileContextRename: 'Rename',
  fileContextDelete: 'Delete',
  changesStage: 'Stage',
  changesUnstage: 'Unstage',
  changesDiscard: 'Discard',
} as unknown as CopyDict;

const copyToClipboard = vi.fn(async (_text: string) => {});
const clipboardWriteText = vi.fn(async (_text: string) => {});
const onOpenFile = vi.fn();
const revealInFileManager = vi.fn(async (_path: string) => {});
const stageWorkspaceFile = vi.fn(async (_p: string, _w?: string) => {});
const unstageWorkspaceFile = vi.fn(async (_p: string, _w?: string) => {});
const discardWorkspaceFile = vi.fn(async (_p: string, _w?: string) => {});
const setClipboard = vi.fn();

const WORKSPACE = { id: 'ws-1', path: '/workspace-one', name: 'ws-one' } as never;

const setRenamingPath = vi.fn((_p: string | null) => {});
const setRenameDialogOpen = vi.fn((_o: boolean) => {});
const setDeleteConfirmPath = vi.fn((_p: string | null) => {});
const setRenamingWorkspacePath = vi.fn((_p: string | undefined) => {});
const setDeleteWorkspacePath = vi.fn((_p: string | undefined) => {});
const onRequestDiscardConfirm = vi.fn((_p: string, _w: string) => {});
const reportError = vi.fn();

function dirNode(): WorkspaceTreeNode {
  return {
    path: 'packages/foo',
    name: 'foo',
    kind: 'directory',
    children: [],
    states: ['modified'],
  } as unknown as WorkspaceTreeNode;
}

function fileNode(): WorkspaceTreeNode {
  return {
    path: 'packages/foo/index.ts',
    name: 'index.ts',
    kind: 'file',
    children: [],
    states: ['modified'],
  } as unknown as WorkspaceTreeNode;
}

function renderActions() {
  return renderHook(
    () => {
      const contextMenuPersistRef = useRef(false);
      const { getContextMenuItems } = useFileContextMenuItems({
        t: mockT,
        copyToClipboard,
        contextMenuPersistRef,
        setRenamingPath,
        setRenameDialogOpen,
        setDeleteConfirmPath,
        setRenamingWorkspacePath,
        setDeleteWorkspacePath,
        includeOpenInFiles: false,
        onOpenFile,
        // 事项2 设计：变更树目录同样出菜单
        showMenuForDirectories: true,
        showClipboard: false,
        showGitActions: true,
      });
      return useWorkspaceChangesActions({
        workspace: WORKSPACE,
        onToggleExpand: () => {},
        onHideFromRightPanels: () => {},
        onRefreshTree: () => {},
        getContextMenuItems,
        setRenamingWorkspacePath,
        setDeleteWorkspacePath,
        onRequestDiscardConfirm,
      });
    },
    {
      wrapper: ({ children }) => (
        <TCopyProvider t={mockT} locale="zh-CN">
          {children}
        </TCopyProvider>
      ),
    },
  );
}

describe('WorkspaceChangesActions directory context menu (事项2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(useAppStore, 'getState').mockReturnValue({
      clipboardOperation: null,
      setClipboard,
      stageWorkspaceFile,
      unstageWorkspaceFile,
      discardWorkspaceFile,
    } as never);
    (window as never as { digitalLife: unknown }).digitalLife = {
      workspace: { revealInFileManager },
    };
    Object.assign(navigator, { clipboard: { writeText: clipboardWriteText } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as never as { digitalLife?: unknown }).digitalLife;
  });

  it('目录节点有右键菜单（不再为空）', () => {
    const { result } = renderActions();
    const items = result.current.wrappedGetContextMenuItems(dirNode());
    const ids = items.map((i) => i.id);
    expect(ids).toContain('reveal');
    expect(ids).toContain('copy-full-path');
    expect(ids).toContain('copy-relative-path');
    expect(ids).toContain('rename');
    expect(ids).toContain('delete');
  });

  it('事项2追加：文件与目录菜单均无 open-in-files（已删除）', () => {
    const { result } = renderActions();
    const dirIds = result.current.wrappedGetContextMenuItems(dirNode()).map((i) => i.id);
    const fileIds = result.current.wrappedGetContextMenuItems(fileNode()).map((i) => i.id);
    expect(dirIds).not.toContain('open-in-files');
    expect(fileIds).not.toContain('open-in-files');
  });

  it('目录 Git 项走该节点所属工作区 path（stage/discard 真实可用）', async () => {
    const { result } = renderActions();
    const items = result.current.wrappedGetContextMenuItems(dirNode());
    const stage = items.find((i) => i.id === 'stage');
    const discard = items.find((i) => i.id === 'discard');
    expect(stage).toBeDefined();
    expect(discard).toBeDefined();

    await act(async () => {
      await stage!.action?.(dirNode(), [dirNode()]);
    });
    expect(stageWorkspaceFile).toHaveBeenCalledWith('packages/foo', '/workspace-one');

    // 目录级 discard 走二次确认（审查 2-1），不再即时执行
    await act(async () => {
      await discard!.action?.(dirNode(), [dirNode()]);
    });
    expect(onRequestDiscardConfirm).toHaveBeenCalledWith('packages/foo', '/workspace-one');
    expect(discardWorkspaceFile).not.toHaveBeenCalled();
  });

  it('文件级 discard 仍即时执行（不弹确认）', async () => {
    const { result } = renderActions();
    const discard = result.current
      .wrappedGetContextMenuItems(fileNode())
      .find((i) => i.id === 'discard');
    expect(discard).toBeDefined();

    await act(async () => {
      await discard!.action?.(fileNode(), [fileNode()]);
    });
    expect(onRequestDiscardConfirm).not.toHaveBeenCalled();
    expect(discardWorkspaceFile).toHaveBeenCalledWith('packages/foo/index.ts', '/workspace-one');
  });

  it('目录 reveal 拼该工作区全路径（不回退 currentWorkspace）', async () => {
    const { result } = renderActions();
    const reveal = result.current
      .wrappedGetContextMenuItems(dirNode())
      .find((i) => i.id === 'reveal');
    expect(reveal).toBeDefined();

    await act(async () => {
      await reveal!.action?.(dirNode(), [dirNode()]);
    });
    expect(revealInFileManager).toHaveBeenCalledWith('/workspace-one/packages/foo');
  });

  it('目录复制完整路径拼该工作区全路径', async () => {
    const { result } = renderActions();
    const copyFull = result.current
      .wrappedGetContextMenuItems(dirNode())
      .find((i) => i.id === 'copy-full-path');
    expect(copyFull).toBeDefined();

    await act(async () => {
      await copyFull!.action?.(dirNode(), [dirNode()]);
    });
    // wrapper 内复制走 hook 自带 navigator.clipboard（与文件面板一致），
    // 而非 useFileContextMenuItems 注入的 copyToClipboard。
    expect(clipboardWriteText).toHaveBeenCalledWith('/workspace-one/packages/foo');
  });

  it('目录重命名/删除把该工作区 path 注入面板态（多工作区隔离）', () => {
    const { result } = renderActions();
    const items = result.current.wrappedGetContextMenuItems(dirNode());
    const rename = items.find((i) => i.id === 'rename');
    const del = items.find((i) => i.id === 'delete');
    expect(rename).toBeDefined();
    expect(del).toBeDefined();

    rename!.action?.(dirNode(), [dirNode()]);
    expect(setRenamingPath).toHaveBeenCalledWith('packages/foo');
    expect(setRenamingWorkspacePath).toHaveBeenCalledWith('/workspace-one');

    del!.action?.(dirNode(), [dirNode()]);
    expect(setDeleteConfirmPath).toHaveBeenCalledWith('packages/foo');
    expect(setDeleteWorkspacePath).toHaveBeenCalledWith('/workspace-one');
  });
});

/**
 * 事项 7 的核心决策都落在 hook 里（直推门控 / 预检 / 提交后 ahead+1）。
 * 本组用例覆盖这些分支，作为回归保护。
 */
describe('WorkspaceChangesActions push preflight (事项 7)', () => {
  const pushWorkspaceChanges = vi.fn(async (_path?: string, _info?: unknown) => true);
  const commitWorkspaceChanges = vi.fn(async () => undefined as string | undefined);
  const refreshGitSnapshot = vi.fn(async () => {});
  const listGitBranches = vi.fn();
  let snapshots: Record<string, unknown> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    snapshots = {};
    listGitBranches.mockResolvedValue({
      ok: true,
      data: [{ name: 'main', isCurrent: true, ahead: 2, upstream: 'origin/main' }],
    });
    vi.spyOn(useAppStore, 'getState').mockReturnValue({
      clipboardOperation: null,
      setClipboard,
      stageWorkspaceFile,
      unstageWorkspaceFile,
      discardWorkspaceFile,
      refreshGitSnapshot,
      get gitSnapshots() {
        return snapshots;
      },
      pushWorkspaceChanges,
      commitWorkspaceChanges,
      reportError,
    } as never);
    (window as never as { digitalLife: unknown }).digitalLife = {
      workspace: { revealInFileManager, listGitBranches },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as never as { digitalLife?: unknown }).digitalLife;
  });

  it('干净 + 有 upstream：跳过预检直接推送', async () => {
    const { result } = renderActions();
    await act(async () => {
      await result.current.handlePush();
    });
    expect(refreshGitSnapshot).toHaveBeenCalledWith('ws-1', '/workspace-one', { silent: true });
    expect(pushWorkspaceChanges).toHaveBeenCalledWith('/workspace-one', {
      ahead: 2,
      hasUpstream: true,
    });
    expect(result.current.pushPreflightOpen).toBe(false);
  });

  it.each([
    ['未提交变更', { staged: ['a'], unstaged: [], untracked: [], conflicts: [] }, 'origin/main'],
    ['冲突也算脏', { staged: [], unstaged: [], untracked: [], conflicts: ['c'] }, 'origin/main'],
    ['无 upstream', { staged: [], unstaged: [], untracked: [], conflicts: [] }, undefined],
  ])('%s：打开合并预检而不直接推送', async (_label, snapshot, upstream) => {
    snapshots = { 'ws-1': snapshot };
    listGitBranches.mockResolvedValue({
      ok: true,
      data: [{ name: 'main', isCurrent: true, ahead: 2, upstream }],
    });
    const { result } = renderActions();

    await act(async () => {
      await result.current.handlePush();
    });

    expect(result.current.pushPreflightOpen).toBe(true);
    if (upstream === undefined) {
      expect(result.current.pushPreflightHasUpstream).toBe(false);
    }
    expect(pushWorkspaceChanges).not.toHaveBeenCalled();
  });

  it('仅推送已提交：沿用预检时读取的 ahead', async () => {
    snapshots = { 'ws-1': { staged: ['a'], unstaged: [], untracked: [], conflicts: [] } };
    const { result } = renderActions();
    await act(async () => {
      await result.current.handlePush();
    });
    await act(async () => {
      await result.current.handlePushOnly();
    });
    expect(pushWorkspaceChanges).toHaveBeenCalledWith('/workspace-one', {
      ahead: 2,
      hasUpstream: true,
    });
    expect(result.current.pushPreflightOpen).toBe(false);
  });

  it('提交并推送：提交成功后按 ahead + 1 推送', async () => {
    snapshots = { 'ws-1': { staged: ['a'], unstaged: [], untracked: [], conflicts: [] } };
    const { result } = renderActions();
    await act(async () => {
      await result.current.handlePush();
    });
    act(() => {
      result.current.handleCommitAndPush();
    });
    expect(result.current.commitOpen).toBe(true);

    await act(async () => {
      await result.current.submitCommit('feat: x', true);
    });

    expect(commitWorkspaceChanges).toHaveBeenCalledWith('feat: x', {
      stageAll: true,
      workspacePath: '/workspace-one',
    });
    expect(pushWorkspaceChanges).toHaveBeenCalledWith('/workspace-one', {
      ahead: 3,
      hasUpstream: true,
    });
  });

  it('提交失败：不推送，错误留在提交对话框', async () => {
    snapshots = { 'ws-1': { staged: ['a'], unstaged: [], untracked: [], conflicts: [] } };
    commitWorkspaceChanges.mockResolvedValueOnce('commit failed');
    const { result } = renderActions();
    await act(async () => {
      await result.current.handlePush();
    });
    act(() => {
      result.current.handleCommitAndPush();
    });

    await act(async () => {
      await result.current.submitCommit('feat: x', true);
    });

    expect(pushWorkspaceChanges).not.toHaveBeenCalled();
    expect(result.current.commitOpen).toBe(true);
    expect(result.current.commitError).toBe('commit failed');
  });

  it('取消预检：不推送且对话框关闭', async () => {
    snapshots = { 'ws-1': { staged: ['a'], unstaged: [], untracked: [], conflicts: [] } };
    const { result } = renderActions();
    await act(async () => {
      await result.current.handlePush();
    });
    act(() => {
      result.current.cancelPushPreflight();
    });
    expect(result.current.pushPreflightOpen).toBe(false);
    expect(pushWorkspaceChanges).not.toHaveBeenCalled();
  });

  it('closeCommit 清掉待推送标记：关闭提交框后提交不再推送', async () => {
    snapshots = { 'ws-1': { staged: ['a'], unstaged: [], untracked: [], conflicts: [] } };
    const { result } = renderActions();
    await act(async () => {
      await result.current.handlePush();
    });
    act(() => {
      result.current.handleCommitAndPush();
    });
    act(() => {
      result.current.closeCommit();
    });

    await act(async () => {
      await result.current.submitCommit('feat: x', true);
    });

    expect(commitWorkspaceChanges).toHaveBeenCalled();
    expect(pushWorkspaceChanges).not.toHaveBeenCalled();
  });

  it('分支列表失败：全局错误卡按 error 级别上报并带重试动作', async () => {
    listGitBranches.mockResolvedValueOnce({
      ok: false,
      error: { code: 'WORKSPACE_ERROR', message: 'branch list failed' },
    });
    const { result } = renderActions();
    await act(async () => {
      await result.current.handlePush();
    });

    expect(reportError).toHaveBeenCalledWith(
      'WORKSPACE_ERROR',
      'branch list failed',
      'git:push:ws-1',
      expect.objectContaining({ level: 'error', actions: expect.any(Array) }),
    );
    const options = reportError.mock.calls[0][3] as { actions: { run: () => Promise<boolean> }[] };
    expect(options.actions).toHaveLength(1);
  });

  it('分支列表失败的重试动作重新走完整预检（刷新 + 重新查分支）', async () => {
    listGitBranches
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'WORKSPACE_ERROR', message: 'branch list failed' },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: [{ name: 'main', isCurrent: true, ahead: 2, upstream: 'origin/main' }],
      });
    const { result } = renderActions();
    await act(async () => {
      await result.current.handlePush();
    });
    const options = reportError.mock.calls[0][3] as {
      actions: { run: () => Promise<boolean> }[];
    };

    let runResult: boolean | undefined;
    await act(async () => {
      runResult = await options.actions[0].run();
    });

    // false = 不自动关闭卡片；成功由 scope 清理，失败会重新上报。
    expect(runResult).toBe(false);
    expect(refreshGitSnapshot).toHaveBeenCalledTimes(2);
    expect(listGitBranches).toHaveBeenCalledTimes(2);
    expect(pushWorkspaceChanges).toHaveBeenCalledWith('/workspace-one', {
      ahead: 2,
      hasUpstream: true,
    });
  });
});
