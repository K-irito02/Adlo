import type { FileTreeContextMenuItem } from '@features/file-tree';
import type { WorkspaceTreeNode } from '@shared/ipc';
import { useAppStore } from '@stores/slicedStore';

/**
 * 把剪贴板内容粘贴到指定工作区的目录（`targetDir` 传 `''` 表示工作区根）。
 *
 * `workspacePath` 为 `undefined` 时走同工作区分支，由 store action 回落到当前激活工作区
 * （非工作区树的通用右键菜单没有工作区上下文）。
 *
 * 同工作区走现有 duplicate/move；跨工作区走 copyFileAcross / moveFileAcross。
 * 失败时保留剪贴板（用户可重试或换目标），成功才清空。
 */
export async function pasteClipboardIntoWorkspace(
  workspacePath: string | undefined,
  targetDir: string,
): Promise<boolean> {
  const store = useAppStore.getState();
  const sourcePath = store.clipboardSourcePath;
  const operation = store.clipboardOperation;
  if (!sourcePath || !operation) {
    return false;
  }
  const sourceName = sourcePath.split('/').pop() || sourcePath;
  const newPath = targetDir ? `${targetDir}/${sourceName}` : sourceName;
  const sourceWorkspacePath = store.clipboardSourceWorkspacePath;

  if (!sourceWorkspacePath || !workspacePath || sourceWorkspacePath === workspacePath) {
    if (operation === 'copy') {
      const ok = await store.duplicateWorkspaceFile(sourcePath, newPath, workspacePath);
      if (!ok) {
        return false;
      }
    } else {
      if (sourcePath === newPath) {
        store.clearClipboard();
        return true;
      }
      const ok = await store.moveWorkspaceFile(sourcePath, newPath, workspacePath);
      if (!ok) {
        return false;
      }
    }
    store.clearClipboard();
    return true;
  }

  const input = {
    sourceWorkspacePath,
    sourceRelativePath: sourcePath,
    targetWorkspacePath: workspacePath,
    targetRelativePath: newPath,
  };
  const ok =
    operation === 'copy'
      ? await store.copyWorkspaceFileAcross(input)
      : await store.moveWorkspaceFileAcross(input);
  if (!ok) {
    return false;
  }
  store.clearClipboard();
  return true;
}

/**
 * 把「复制/剪切」的来源工作区写进剪贴板，并让「粘贴」按同区/跨区分流。
 *
 * 菜单项 id 由右面板通用菜单提供：剪切 = `cut`、复制 = `copy-op`、
 * 粘贴 = `paste`（`copy-full-path` / `copy-relative-path` 是纯文本复制，不参与）。
 */
export function bindWorkspaceClipboard(
  items: FileTreeContextMenuItem<WorkspaceTreeNode>[],
  workspacePath: string,
): FileTreeContextMenuItem<WorkspaceTreeNode>[] {
  return items.map((item) => {
    if (item.separator) {
      return item;
    }
    if (item.id === 'cut' || item.id === 'copy-op') {
      const isCut = item.id === 'cut';
      return {
        ...item,
        action: (targetNode: WorkspaceTreeNode) => {
          useAppStore
            .getState()
            .setClipboard(isCut ? 'cut' : 'copy', targetNode.path, workspacePath);
        },
      };
    }
    if (item.id !== 'paste') {
      return item;
    }
    return {
      ...item,
      action: async (targetNode: WorkspaceTreeNode) => {
        const targetDir =
          targetNode.kind === 'directory'
            ? targetNode.path
            : targetNode.path.substring(0, targetNode.path.lastIndexOf('/') + 1);
        await pasteClipboardIntoWorkspace(workspacePath, targetDir);
      },
    };
  });
}
