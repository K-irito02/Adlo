import { useCallback } from 'react';
import type React from 'react';
import {
  IconClipboardList,
  IconCopy,
  IconFiles,
  IconFolderOpen,
  IconMinus,
  IconPencil,
  IconPlus,
  IconTrash,
  IconUpload,
} from '@app/icons';
import { useAppStore } from '@stores/slicedStore';
import { joinPathSegments } from '@app/utils/workspacePaths';
import type { FileTreeContextMenuItem, FileTreeRenderableNode } from '@features/file-tree';
import type { CopyDict } from '@app/i18n/types';

export interface UseFileContextMenuItemsParams {
  t: CopyDict;
  copyToClipboard: (text: string) => Promise<void>;
  contextMenuPersistRef: React.MutableRefObject<boolean>;
  setRenamingPath: (path: string | null) => void;
  setRenameDialogOpen: (open: boolean) => void;
  setDeleteConfirmPath: (path: string | null) => void;
  includeOpenInFiles?: boolean;
  onOpenFile?: (relativePath: string) => void;
  isNodeDeleted?: (node: FileTreeRenderableNode) => boolean;
  showMenuForDirectories?: boolean;
  showClipboard?: boolean;
  showGitActions?: boolean;
}

export function useFileContextMenuItems(params: UseFileContextMenuItemsParams) {
  const {
    t,
    copyToClipboard,
    contextMenuPersistRef,
    setRenamingPath,
    setRenameDialogOpen,
    setDeleteConfirmPath,
    includeOpenInFiles = false,
    onOpenFile,
    isNodeDeleted,
    showMenuForDirectories = true,
    showClipboard = true,
    showGitActions = false,
  } = params;

  const getContextMenuItems = useCallback(
    <T extends FileTreeRenderableNode>(node: T): FileTreeContextMenuItem<T>[] => {
      const isDir = node.kind === 'directory';

      if (isDir && !showMenuForDirectories) {
        return [];
      }

      const deleted = isNodeDeleted?.(node) ?? false;
      const store = useAppStore.getState();
      const hasClipboard = store.clipboardOperation !== null;

      const items: FileTreeContextMenuItem<T>[] = [];

      if (includeOpenInFiles && onOpenFile) {
        items.push({
          id: 'open-in-files',
          label: t.fileContextOpenWith as string,
          icon: <IconFiles size={14} />,
          disabled: deleted,
          action: (targetNode) => onOpenFile(targetNode.path),
        });
        items.push({ id: 'sep0', separator: true });
      }

      if (showGitActions) {
        const states: string[] = (node as unknown as { states?: string[] }).states ?? [];
        const hasStaged = states.includes('staged');
        const hasUnstaged = states.includes('modified') || states.includes('untracked');

        if (hasStaged) {
          items.push({
            id: 'unstage',
            label: t.changesUnstage as string,
            icon: <IconMinus size={14} />,
            action: async (targetNode) => {
              const s = useAppStore.getState();
              await s.unstageWorkspaceFile(targetNode.path);
            },
          });
        }

        if (hasUnstaged) {
          items.push({
            id: 'stage',
            label: t.changesStage as string,
            icon: <IconPlus size={14} />,
            action: async (targetNode) => {
              const s = useAppStore.getState();
              await s.stageWorkspaceFile(targetNode.path);
            },
          });
        }

        if (hasUnstaged) {
          items.push({
            id: 'discard',
            label: t.changesDiscard as string,
            icon: <IconTrash size={14} />,
            danger: true,
            action: async (targetNode) => {
              const s = useAppStore.getState();
              await s.discardWorkspaceFile(targetNode.path);
            },
          });
        }

        if (hasStaged || hasUnstaged) {
          items.push({ id: 'git-sep', separator: true });
        }
      }

      items.push({
        id: 'reveal',
        label: isDir ? (t.fileContextRevealDir as string) : (t.fileContextReveal as string),
        icon: <IconFolderOpen size={14} />,
        disabled: deleted,
        action: async (targetNode) => {
          const store = useAppStore.getState();
          const rootPath =
            store.appInfo?.currentWorkspace?.rootPath ?? store.appInfo?.currentWorkspace?.path;
          if (!rootPath) {
            return;
          }
          const fullPath = joinPathSegments(rootPath, targetNode.path);
          await window.digitalLife.workspace.revealInFileManager(fullPath);
        },
      });

      items.push({ id: 'sep1', separator: true });

      items.push({
        id: 'copy-full-path',
        label: t.fileContextCopyFullPath as string,
        icon: <IconCopy size={14} />,
        action: async (targetNode) => {
          const store = useAppStore.getState();
          const rootPath =
            store.appInfo?.currentWorkspace?.rootPath ?? store.appInfo?.currentWorkspace?.path;
          if (!rootPath) {
            return;
          }
          const fullPath = joinPathSegments(rootPath, targetNode.path);
          await copyToClipboard(fullPath);
        },
      });

      items.push({
        id: 'copy-relative-path',
        label: t.fileContextCopyRelativePath as string,
        icon: <IconCopy size={14} />,
        action: async (targetNode) => {
          await copyToClipboard(targetNode.path);
        },
      });

      if (showClipboard) {
        items.push({ id: 'sep2', separator: true });

        items.push({
          id: 'cut',
          label: t.fileContextCut as string,
          icon: <IconClipboardList size={14} />,
          action: (targetNode) => {
            store.setClipboard('cut', targetNode.path, targetNode.kind);
          },
        });

        items.push({
          id: 'copy-op',
          label: t.fileContextCopy as string,
          icon: <IconCopy size={14} />,
          action: (targetNode) => {
            store.setClipboard('copy', targetNode.path, targetNode.kind);
          },
        });

        items.push({
          id: 'paste',
          label: t.fileContextPaste as string,
          icon: <IconUpload size={14} />,
          disabled: !hasClipboard,
          action: async (targetNode) => {
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
            if (operation === 'copy') {
              await store.duplicateWorkspaceFile(sourcePath, newPath);
            } else if (operation === 'cut') {
              if (sourcePath === newPath) {
                store.clearClipboard();
                return;
              }
              await store.moveWorkspaceFile(sourcePath, newPath);
            }
            store.clearClipboard();
          },
        });
      }

      items.push({ id: 'sep3', separator: true });

      items.push({
        id: 'rename',
        label: t.fileContextRename as string,
        icon: <IconPencil size={14} />,
        disabled: deleted,
        action: (targetNode) => {
          contextMenuPersistRef.current = true;
          setRenamingPath(targetNode.path);
          setRenameDialogOpen(true);
        },
      });

      items.push({
        id: 'delete',
        label: t.fileContextDelete as string,
        icon: <IconTrash size={14} />,
        danger: true,
        disabled: deleted,
        action: (targetNode) => {
          contextMenuPersistRef.current = true;
          setDeleteConfirmPath(targetNode.path);
        },
      });

      return items;
    },
    [
      t,
      copyToClipboard,
      contextMenuPersistRef,
      setRenamingPath,
      setRenameDialogOpen,
      setDeleteConfirmPath,
      includeOpenInFiles,
      onOpenFile,
      isNodeDeleted,
      showMenuForDirectories,
      showClipboard,
      showGitActions,
    ]
  );

  return { getContextMenuItems };
}
