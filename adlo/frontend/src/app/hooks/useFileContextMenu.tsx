import { useCallback, useRef, useState } from 'react';
import type { CopyDict } from '../i18n';
import { copyToClipboard } from '../i18n';
import {
  IconClipboardList,
  IconCopy,
  IconFiles,
  IconFolderOpen,
  IconPencil,
  IconDelete,
  IconUpload,
} from '../icons';
import { joinPathSegments } from '../utils/workspacePaths';
import { useAppStore } from '../stores/slicedStore';
import type { FileTreeContextMenuItem, FileTreeRenderableNode } from '../features/file-tree';

interface UseFileContextMenuOptions<T extends FileTreeRenderableNode> {
  t: CopyDict;
  onOpenFile?: (path: string) => void;
  fileOnly?: boolean;
  isDisabled?: (node: T) => boolean;
}

interface UseFileContextMenuReturn<T extends FileTreeRenderableNode> {
  renamingPath: string | null;
  deleteConfirmPath: string | null;
  contextMenuPersistRef: React.MutableRefObject<boolean>;
  clearMenuHighlightRef: React.MutableRefObject<(() => void) | undefined>;
  handleRenameConfirm: (newName: string) => Promise<void>;
  handleRenameCancel: () => void;
  handleDeleteConfirm: () => Promise<void>;
  handleDeleteCancel: () => void;
  getContextMenuItems: (node: T) => FileTreeContextMenuItem<T>[];
}

function useFileContextMenu<T extends FileTreeRenderableNode>({
  t,
  onOpenFile,
  fileOnly = false,
  isDisabled,
}: UseFileContextMenuOptions<T>): UseFileContextMenuReturn<T> {
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [deleteConfirmPath, setDeleteConfirmPath] = useState<string | null>(null);
  const contextMenuPersistRef = useRef(false);
  const clearMenuHighlightRef = useRef<(() => void) | undefined>(undefined);

  const handleRenameConfirm = useCallback(
    async (newName: string) => {
      if (!renamingPath) {
        return;
      }
      const path = renamingPath;
      setRenamingPath(null);
      clearMenuHighlightRef.current?.();
      await useAppStore.getState().renameWorkspaceFile(path, newName);
    },
    [renamingPath],
  );

  const handleRenameCancel = useCallback(() => {
    setRenamingPath(null);
    clearMenuHighlightRef.current?.();
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirmPath) {
      return;
    }
    const path = deleteConfirmPath;
    setDeleteConfirmPath(null);
    clearMenuHighlightRef.current?.();
    await useAppStore.getState().deleteWorkspaceFile(path);
  }, [deleteConfirmPath]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirmPath(null);
    clearMenuHighlightRef.current?.();
  }, []);

  const getContextMenuItems = useCallback(
    (node: T): FileTreeContextMenuItem<T>[] => {
      if (fileOnly && node.kind !== 'file') {
        return [];
      }
      const disabled = isDisabled?.(node) ?? false;
      const store = useAppStore.getState();
      const hasClipboard = store.clipboardOperation !== null;
      const revealLabel = fileOnly
        ? (t.fileContextReveal as string)
        : node.kind === 'directory'
          ? (t.fileContextRevealDir as string)
          : (t.fileContextReveal as string);

      const items: FileTreeContextMenuItem<T>[] = [];

      if (onOpenFile) {
        items.push(
          {
            id: 'open-in-files',
            label: t.fileContextOpenWith as string,
            icon: <IconFiles size={14} />,
            disabled,
            action: (targetNode) => onOpenFile(targetNode.path),
          },
          { id: 'sep0', separator: true },
        );
      }

      items.push(
        {
          id: 'reveal',
          label: revealLabel,
          icon: <IconFolderOpen size={14} />,
          disabled,
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
        },
        { id: 'sep1', separator: true },
        {
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
        },
        {
          id: 'copy-relative-path',
          label: t.fileContextCopyRelativePath as string,
          icon: <IconCopy size={14} />,
          action: async (targetNode) => {
            await copyToClipboard(targetNode.path);
          },
        },
        { id: 'sep2', separator: true },
        {
          id: 'cut',
          label: t.fileContextCut as string,
          icon: <IconClipboardList size={14} />,
          action: (targetNode) => {
            store.setClipboard('cut', targetNode.path, targetNode.kind);
          },
        },
        {
          id: 'copy-op',
          label: t.fileContextCopy as string,
          icon: <IconCopy size={14} />,
          action: (targetNode) => {
            store.setClipboard('copy', targetNode.path, targetNode.kind);
          },
        },
        {
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
        },
        { id: 'sep3', separator: true },
        {
          id: 'rename',
          label: t.fileContextRename as string,
          icon: <IconPencil size={14} />,
          disabled,
          action: (targetNode) => {
            contextMenuPersistRef.current = true;
            setRenamingPath(targetNode.path);
          },
        },
        {
          id: 'delete',
          label: t.fileContextDelete as string,
          icon: <IconDelete size={14} />,
          danger: true,
          disabled,
          action: (targetNode) => {
            contextMenuPersistRef.current = true;
            setDeleteConfirmPath(targetNode.path);
          },
        },
      );

      return items;
    },
    [t, onOpenFile, fileOnly, isDisabled],
  );

  return {
    renamingPath,
    deleteConfirmPath,
    contextMenuPersistRef,
    clearMenuHighlightRef,
    handleRenameConfirm,
    handleRenameCancel,
    handleDeleteConfirm,
    handleDeleteCancel,
    getContextMenuItems,
  };
}

export { useFileContextMenu };
export type { UseFileContextMenuOptions, UseFileContextMenuReturn };
