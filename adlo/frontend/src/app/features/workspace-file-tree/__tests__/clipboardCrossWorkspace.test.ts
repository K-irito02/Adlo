import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FileTreeContextMenuItem } from '@features/file-tree';
import type { WorkspaceTreeNode } from '@shared/ipc';
import { useAppStore } from '@stores/slicedStore';
import { bindWorkspaceClipboard } from '../workspaceClipboard';

const target: WorkspaceTreeNode = {
  path: 'assets',
  name: 'assets',
  kind: 'directory',
  children: [],
};

function item(
  id: string,
  action: (node: WorkspaceTreeNode) => void | Promise<void> = () => {},
): FileTreeContextMenuItem<WorkspaceTreeNode> {
  return { id, label: id, action: (node) => action(node) };
}

function bound(ids: string[], action?: (node: WorkspaceTreeNode) => void | Promise<void>) {
  return bindWorkspaceClipboard(
    ids.map((id) => item(id, action)),
    '/ws-b',
  );
}

async function invoke(items: FileTreeContextMenuItem<WorkspaceTreeNode>[], id: string) {
  const entry = items.find((candidate) => candidate.id === id);
  if (!entry || entry.separator) {
    throw new Error(`missing menu item ${id}`);
  }
  await entry.action?.(target, [target]);
}

describe('bindWorkspaceClipboard', () => {
  afterEach(() => {
    useAppStore.getState().clearClipboard();
    vi.restoreAllMocks();
  });

  it('复制菜单项（id=copy-op）记录来源工作区', async () => {
    const items = bound(['cut', 'copy-op']);

    await invoke(items, 'copy-op');

    const state = useAppStore.getState();
    expect(state.clipboardOperation).toBe('copy');
    expect(state.clipboardSourcePath).toBe('assets');
    expect(state.clipboardSourceWorkspacePath).toBe('/ws-b');
  });

  it('剪切菜单项（id=cut）记录来源工作区', async () => {
    await invoke(bound(['cut']), 'cut');

    expect(useAppStore.getState().clipboardOperation).toBe('cut');
    expect(useAppStore.getState().clipboardSourceWorkspacePath).toBe('/ws-b');
  });

  it('跨工作区粘贴走 copyFileAcross，成功后清空剪贴板', async () => {
    const copyAcross = vi.fn(async () => true);
    useAppStore.setState({ copyWorkspaceFileAcross: copyAcross });
    useAppStore.getState().setClipboard('copy', 'docs/guide.md', 'file', '/ws-a');

    await invoke(bound(['paste']), 'paste');

    expect(copyAcross).toHaveBeenCalledWith({
      sourceWorkspacePath: '/ws-a',
      sourceRelativePath: 'docs/guide.md',
      targetWorkspacePath: '/ws-b',
      targetRelativePath: 'assets/guide.md',
    });
    expect(useAppStore.getState().clipboardOperation).toBeNull();
  });

  it('跨工作区粘贴失败保留剪贴板，便于重试', async () => {
    const copyAcross = vi.fn(async () => false);
    useAppStore.setState({ copyWorkspaceFileAcross: copyAcross });
    useAppStore.getState().setClipboard('copy', 'docs/guide.md', 'file', '/ws-a');

    await invoke(bound(['paste']), 'paste');

    expect(copyAcross).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().clipboardOperation).toBe('copy');
    expect(useAppStore.getState().clipboardSourceWorkspacePath).toBe('/ws-a');
  });
});
