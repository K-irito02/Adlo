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
  const [changesDeleteConfirmPath, setChangesDeleteConfirmPath] = useState<string | null>(null);
  const changesContextMenuPersistRef = useRef(false);
  const changesClearMenuHighlightRef = useRef<(() => void) | undefined>(undefined);

  const onChangesRenameConfirm = useCallback(
    async (newName: string) => {
      await handleChangesRenameConfirm(
        changesRenamingPath,
        setChangesRenamingPath,
        setChangesRenameDialogOpen,
        () => changesClearMenuHighlightRef.current?.(),
        (path, name) => useAppStore.getState().renameWorkspaceFile(path, name),
        newName
      );
    },
    [changesRenamingPath]
  );

  const onChangesRenameCancel = useCallback(() => {
    handleChangesCancel(setChangesRenamingPath, setChangesRenameDialogOpen, () =>
      changesClearMenuHighlightRef.current?.()
    );
  }, []);

  const onChangesDeleteConfirm = useCallback(async () => {
    await handleChangesDeleteConfirm(
      changesDeleteConfirmPath,
      setChangesDeleteConfirmPath,
      () => changesClearMenuHighlightRef.current?.(),
      (path) => useAppStore.getState().deleteWorkspaceFile(path)
    );
  }, [changesDeleteConfirmPath]);

  const onChangesDeleteCancel = useCallback(() => {
    handleChangesCancel(
      setChangesDeleteConfirmPath,
      () => {},
      () => changesClearMenuHighlightRef.current?.()
    );
  }, []);

  return {
    changesRenameDialogOpen,
    changesRenamingPath,
    changesDeleteConfirmPath,
    changesContextMenuPersistRef,
    changesClearMenuHighlightRef,
    setChangesRenamingPath,
    setChangesRenameDialogOpen,
    setChangesDeleteConfirmPath,
    onChangesRenameConfirm,
    onChangesRenameCancel,
    onChangesDeleteConfirm,
    onChangesDeleteCancel,
  };
}
