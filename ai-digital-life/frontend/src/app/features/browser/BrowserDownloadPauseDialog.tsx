import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTCopy } from '@i18n/useTCopy';

interface BrowserDownloadPauseDialogProps {
  open: boolean;
  fileName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function BrowserDownloadPauseDialog({
  open,
  fileName,
  onConfirm,
  onCancel,
}: BrowserDownloadPauseDialogProps) {
  const { t } = useTCopy();
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Register in the CAPTURE phase so this handler runs BEFORE the download
        // menu/button bubble-phase keydown listeners (which close the whole menu
        // on Escape). Without capture, the dialog — mounted only after the menu
        // is already open — registers its listener last, so stopPropagation
        // would be a no-op and pressing Escape would close the menu too.
        event.stopPropagation();
        event.preventDefault();
        onCancel();
      }
    };
    // Capture phase (true) so we intercept before the menu's bubble-phase listener.
    window.addEventListener('keydown', handleEscape, true);
    confirmRef.current?.focus();
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="adl-confirm-overlay"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={t.browserDownloadPauseDialogTitle}
    >
      <div className="adl-confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="adl-confirm-dialog__header">
          <h3 className="adl-confirm-dialog__title">{t.browserDownloadPauseDialogTitle}</h3>
        </div>
        <div className="adl-confirm-dialog__body">
          <p className="adl-confirm-dialog__message">{t.browserDownloadPauseDialogDesc}</p>
          <p className="adl-confirm-dialog__file-name">{fileName}</p>
        </div>
        <div className="adl-confirm-dialog__footer">
          <button type="button" className="adl-btn adl-btn--secondary" onClick={onCancel}>
            {t.browserDownloadPauseDialogCancel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="adl-btn adl-btn--danger"
            onClick={onConfirm}
          >
            {t.browserDownloadPauseDialogConfirm}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
