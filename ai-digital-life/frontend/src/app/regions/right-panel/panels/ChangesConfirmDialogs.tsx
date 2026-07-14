import { ConfirmDialog } from '@components/ConfirmDialog';
import { useTCopy } from '@i18n/useTCopy';

export interface ChangesConfirmDialogsProps {
  changesDeleteConfirmPath: string | null;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
}

export function ChangesConfirmDialogs({
  changesDeleteConfirmPath,
  onDeleteConfirm,
  onDeleteCancel,
}: ChangesConfirmDialogsProps) {
  const { t } = useTCopy();
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
