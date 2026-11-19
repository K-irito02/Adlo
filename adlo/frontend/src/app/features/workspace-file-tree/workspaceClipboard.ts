import type { FileTreeContextMenuItem } from '@features/file-tree';
import type { WorkspaceTreeNode } from '@shared/ipc';
import { useAppStore } from '@stores/slicedStore';

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
            .setClipboard(isCut ? 'cut' : 'copy', targetNode.path, targetNode.kind, workspacePath);
        },
      };
    }
    if (item.id !== 'paste') {
      return item;
    }
    return {
      ...item,
      action: async (targetNode: WorkspaceTreeNode) => {
        const store = useAppStore.getState();
        const sourcePath = store.clipboardSourcePath;
        const operation = store.clipboardOperation;
        if (!sourcePath || !operation) {
          return;
        }
        const targetDir =
          targetNode.kind === 'directory'
            ? targetNode.path
            : targetNode.path.substring(0, targetNode.path.lastIndexOf('/') + 1);
        const sourceName = sourcePath.split('/').pop() || sourcePath;
        const newPath = targetDir ? `${targetDir}/${sourceName}` : sourceName;
        const sourceWorkspacePath = store.clipboardSourceWorkspacePath;

        if (!sourceWorkspacePath || sourceWorkspacePath === workspacePath) {
          if (operation === 'copy') {
            await store.duplicateWorkspaceFile(sourcePath, newPath, workspacePath);
          } else {
            if (sourcePath === newPath) {
              store.clearClipboard();
              return;
            }
            await store.moveWorkspaceFile(sourcePath, newPath, workspacePath);
          }
          store.clearClipboard();
          return;
        }

        // 跨工作区：复制走 copyFileAcross（源保留），剪切走 moveFileAcross（源移除）。
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
          // 失败保留剪贴板，用户可重试或换个目标。
          return;
        }
        store.clearClipboard();
      },
    };
  });
}
