import React from 'react';
import type { CopyDict } from '@i18n';
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
        <div className="adl-dialog-overlay" role="dialog" aria-modal="true">
          <div className="adl-dialog">
            <h3>{t.fileDeleteConfirm as string}</h3>
            <p>{deleteMessage}</p>
            <div className="adl-dialog__actions">
              <button type="button" onClick={onConfirmDelete}>
                {t.fileDeleteAction as string}
              </button>
              <button type="button" onClick={onCancelDelete}>
                {t.cancel as string}
              </button>
            </div>
          </div>
        </div>
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
