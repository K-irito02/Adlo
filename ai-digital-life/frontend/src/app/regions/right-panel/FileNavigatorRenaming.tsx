import React from 'react';
import type { CopyDict } from '@i18n';
import { ConfirmDialog } from '@components/ConfirmDialog';
import { RenameDialog } from '@components/RenameDialog';

interface FileNavigatorRenamingProps {
  renameDialogOpen: boolean;
  renamingPath: string | null;
  deleteConfirmPath: string | null;
  deleteConfirmKind: 'directory' | 'file';
  t: CopyDict;
  onConfirmRename: (newName: string) => void | Promise<void>;
  onCancelRename: () => void;
  onConfirmDelete: () => void | Promise<void>;
  onCancelDelete: () => void;
}

const FileNavigatorRenaming = React.memo(function FileNavigatorRenaming({
  renameDialogOpen,
  renamingPath,
  deleteConfirmPath,
  deleteConfirmKind,
  t,
  onConfirmRename,
  onCancelRename,
  onConfirmDelete,
  onCancelDelete,
}: FileNavigatorRenamingProps) {
  const deleteMessage =
    deleteConfirmKind === 'directory'
      ? (t.fileDeleteFolderMessage as string)
      : (t.fileDeleteFileMessage as string);
  return (
    <>
      {deleteConfirmPath ? (
        <ConfirmDialog
          title={t.fileDeleteConfirm as string}
          message={deleteMessage}
          confirmLabel={t.fileDeleteAction as string}
          cancelLabel={t.cancel as string}
          danger
          onConfirm={onConfirmDelete}
          onCancel={onCancelDelete}
        />
      ) : null}
      {renameDialogOpen && renamingPath ? (
        <RenameDialog
          open={renameDialogOpen}
          initialValue={renamingPath.split('/').pop() || ''}
          title={t.changesRename}
          placeholder={t.changesEnterNewName}
          onConfirm={onConfirmRename}
          onCancel={onCancelRename}
        />
      ) : null}
    </>
  );
});

export { FileNavigatorRenaming };
export type { FileNavigatorRenamingProps };
