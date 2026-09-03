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
        <div className="adl-dialog-overlay" role="dialog" aria-modal="true">
          <div className="adl-dialog">
            <h3>{t.fileDeleteConfirm as string}</h3>
            <p>{t.fileDeleteMessage as string}</p>
            <div className="adl-dialog__actions">
              <button type="button" onClick={onDeleteConfirm}>
                {t.fileDeleteAction as string}
              </button>
              <button type="button" onClick={onDeleteCancel}>
                {t.cancel as string}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
