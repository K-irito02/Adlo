import { useTCopy } from '@i18n/useTCopy';
import { ConfirmDialog } from '@components/ConfirmDialog';

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
    <ConfirmDialog
      open={!!changesDeleteConfirmPath}
      title={t.fileDeleteConfirm as string}
      message={t.fileDeleteMessage as string}
      confirmLabel={t.fileDeleteAction as string}
      cancelLabel={t.cancel as string}
      onConfirm={onDeleteConfirm}
      onCancel={onDeleteCancel}
    />
  );
}
