import React from 'react';
import { formatT, type CopyDict } from '@i18n';
import { ConfirmDialog } from '@components/ConfirmDialog';
import { RenameDialog } from '@components/RenameDialog';

interface FileNavigatorRenamingProps {
  renameDialogOpen: boolean;
  renamingPath: string | null;
  deleteConfirmPath: string | null;
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
  t,
  onConfirmRename,
  onCancelRename,
  onConfirmDelete,
  onCancelDelete,
}: FileNavigatorRenamingProps) {
  return (
    <>
      {deleteConfirmPath ? (
        <ConfirmDialog
          title={t.fileDeleteConfirm as string}
          message={t.fileDeleteMessage as string}
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
          itemInfo={formatT(t, 'changesCurrentPath', { path: renamingPath })}
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
