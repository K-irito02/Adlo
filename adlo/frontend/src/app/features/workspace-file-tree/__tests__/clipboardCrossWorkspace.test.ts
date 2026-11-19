import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FileTreeContextMenuItem } from '@features/file-tree';
import type { WorkspaceTreeNode } from '@shared/ipc';
import { useAppStore } from '@stores/slicedStore';
import { bindWorkspaceClipboard } from '../workspaceClipboard';
import { FILE_CLIPBOARD_MENU_IDS } from '@regions/right-panel/hooks/fileMenuIds';

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
  const originalDuplicate = useAppStore.getState().duplicateWorkspaceFile;
  const originalMove = useAppStore.getState().moveWorkspaceFile;

  afterEach(() => {
    useAppStore.setState({
      duplicateWorkspaceFile: originalDuplicate,
      moveWorkspaceFile: originalMove,
    });
    useAppStore.getState().clearClipboard();
    vi.restoreAllMocks();
  });

  it('复制菜单项（id=copy-op）记录来源工作区', async () => {
    const items = bound([FILE_CLIPBOARD_MENU_IDS.cut, FILE_CLIPBOARD_MENU_IDS.copy]);

    await invoke(items, FILE_CLIPBOARD_MENU_IDS.copy);

    const state = useAppStore.getState();
    expect(state.clipboardOperation).toBe('copy');
    expect(state.clipboardSourcePath).toBe('assets');
    expect(state.clipboardSourceWorkspacePath).toBe('/ws-b');
  });

  it('剪切菜单项（id=cut）记录来源工作区', async () => {
    await invoke(bound([FILE_CLIPBOARD_MENU_IDS.cut]), FILE_CLIPBOARD_MENU_IDS.cut);

    expect(useAppStore.getState().clipboardOperation).toBe('cut');
    expect(useAppStore.getState().clipboardSourceWorkspacePath).toBe('/ws-b');
  });

  it('跨工作区粘贴走 copyFileAcross，成功后清空剪贴板', async () => {
    const copyAcross = vi.fn(async () => true);
    useAppStore.setState({ copyWorkspaceFileAcross: copyAcross });
    useAppStore.getState().setClipboard('copy', 'docs/guide.md', '/ws-a');

    await invoke(bound([FILE_CLIPBOARD_MENU_IDS.paste]), FILE_CLIPBOARD_MENU_IDS.paste);

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
    useAppStore.getState().setClipboard('copy', 'docs/guide.md', '/ws-a');

    await invoke(bound([FILE_CLIPBOARD_MENU_IDS.paste]), FILE_CLIPBOARD_MENU_IDS.paste);

    expect(copyAcross).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().clipboardOperation).toBe('copy');
    expect(useAppStore.getState().clipboardSourceWorkspacePath).toBe('/ws-a');
  });

  it('同工作区粘贴失败（如目标已存在）保留剪贴板', async () => {
    const duplicate = vi.fn(async () => false);
    useAppStore.setState({ duplicateWorkspaceFile: duplicate });
    useAppStore.getState().setClipboard('copy', 'a.txt', '/ws-b');

    await invoke(bound([FILE_CLIPBOARD_MENU_IDS.paste]), FILE_CLIPBOARD_MENU_IDS.paste);

    expect(duplicate).toHaveBeenCalledWith('a.txt', 'assets/a.txt', '/ws-b');
    expect(useAppStore.getState().clipboardOperation).toBe('copy');
  });
});
