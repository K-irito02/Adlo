import { useCallback, useRef, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import {
  handleChangesRenameConfirm,
  handleChangesDeleteConfirm,
  handleChangesCancel,
} from './useChangesPanelStateUtils';

export function useChangesPanelDialogs() {
  const [changesRenameDialogOpen, setChangesRenameDialogOpen] = useState(false);
  const [changesRenamingPath, setChangesRenamingPath] = useState<string | null>(null);
  // 事项2：重命名/删除必须作用到右键节点所属工作区（多工作区下回退 currentWorkspace
  // 会作用错工作区），与文件面板 renamingWorkspacePath / deleteWorkspacePath 对齐。
  const [changesRenamingWorkspacePath, setChangesRenamingWorkspacePath] = useState<
    string | undefined
  >(undefined);
  const [changesDeleteConfirmPath, setChangesDeleteConfirmPath] = useState<string | null>(null);
  const [changesDeleteWorkspacePath, setChangesDeleteWorkspacePath] = useState<string | undefined>(
    undefined,
  );
  // 目录级 discard 二次确认（审查 2-1）：目录会递归 restore/clean，一次影响面大。
  const [changesDiscardConfirm, setChangesDiscardConfirm] = useState<{
    path: string;
    workspacePath: string;
  } | null>(null);
  const changesContextMenuPersistRef = useRef(false);
  const changesClearMenuHighlightRef = useRef<(() => void) | undefined>(undefined);

  const requestChangesDiscardConfirm = useCallback((path: string, workspacePath: string) => {
    setChangesDiscardConfirm({ path, workspacePath });
  }, []);

  const onChangesDiscardConfirm = useCallback(async () => {
    const target = changesDiscardConfirm;
    setChangesDiscardConfirm(null);
    changesClearMenuHighlightRef.current?.();
    if (target) {
      await useAppStore.getState().discardWorkspaceFile(target.path, target.workspacePath);
    }
  }, [changesDiscardConfirm]);

  const onChangesDiscardCancel = useCallback(() => {
    setChangesDiscardConfirm(null);
    changesClearMenuHighlightRef.current?.();
  }, []);

  const onChangesRenameConfirm = useCallback(
    async (newName: string) => {
      const wsPath = changesRenamingWorkspacePath;
      setChangesRenamingWorkspacePath(undefined);
      await handleChangesRenameConfirm(
        changesRenamingPath,
        setChangesRenamingPath,
        setChangesRenameDialogOpen,
        () => changesClearMenuHighlightRef.current?.(),
        (path, name) => useAppStore.getState().renameWorkspaceFile(path, name, wsPath),
        newName,
      );
    },
    [changesRenamingPath, changesRenamingWorkspacePath],
  );

  const onChangesRenameCancel = useCallback(() => {
    setChangesRenamingWorkspacePath(undefined);
    handleChangesCancel(setChangesRenamingPath, setChangesRenameDialogOpen, () =>
      changesClearMenuHighlightRef.current?.(),
    );
  }, []);

  const onChangesDeleteConfirm = useCallback(async () => {
    const wsPath = changesDeleteWorkspacePath;
    setChangesDeleteWorkspacePath(undefined);
    await handleChangesDeleteConfirm(
      changesDeleteConfirmPath,
      setChangesDeleteConfirmPath,
      () => changesClearMenuHighlightRef.current?.(),
      (path) => useAppStore.getState().deleteWorkspaceFile(path, wsPath),
    );
  }, [changesDeleteConfirmPath, changesDeleteWorkspacePath]);

  const onChangesDeleteCancel = useCallback(() => {
    setChangesDeleteWorkspacePath(undefined);
    handleChangesCancel(
      setChangesDeleteConfirmPath,
      () => {},
      () => changesClearMenuHighlightRef.current?.(),
    );
  }, []);

  return {
    changesRenameDialogOpen,
    changesRenamingPath,
    changesRenamingWorkspacePath,
    changesDeleteConfirmPath,
    changesDeleteWorkspacePath,
    changesDiscardConfirm,
    changesContextMenuPersistRef,
    changesClearMenuHighlightRef,
    setChangesRenamingPath,
    setChangesRenameDialogOpen,
    setChangesRenamingWorkspacePath,
    setChangesDeleteConfirmPath,
    setChangesDeleteWorkspacePath,
    requestChangesDiscardConfirm,
    onChangesDiscardConfirm,
    onChangesDiscardCancel,
    onChangesRenameConfirm,
    onChangesRenameCancel,
    onChangesDeleteConfirm,
    onChangesDeleteCancel,
  };
}
