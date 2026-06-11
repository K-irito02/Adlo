import React from 'react';
import { ConfirmDialog } from '../../../components/ConfirmDialog';

export interface ChangesConfirmDialogsProps {
  changesDeleteConfirmPath: string | null;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
  t: Record<string, string>;
}

export function ChangesConfirmDialogs({
  changesDeleteConfirmPath,
  onDeleteConfirm,
  onDeleteCancel,
  t,
}: ChangesConfirmDialogsProps) {
  return (
    <>
      {changesDeleteConfirmPath ? (
        <ConfirmDialog
          title={t.fileDeleteConfirm as string}
          message={t.fileDeleteMessage as string}
          confirmLabel={t.fileDeleteAction as string}
          cancelLabel={t.cancel as string}
          danger
          onConfirm={onDeleteConfirm}
          onCancel={onDeleteCancel}
        />
      ) : null}
    </>
  );
}
