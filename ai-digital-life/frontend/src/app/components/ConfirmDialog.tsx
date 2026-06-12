import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTCopy } from '../i18n/useTCopy';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTCopy();
  const resolvedConfirm = confirmLabel ?? t.confirm;
  const resolvedCancel = cancelLabel ?? t.cancel;
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleEscape);
    confirmRef.current?.focus();
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onCancel]);

  return createPortal(
    <div
      className="adl-confirm-overlay"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="adl-confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="adl-confirm-dialog__header">
          <h3 className="adl-confirm-dialog__title">{title}</h3>
        </div>
        <div className="adl-confirm-dialog__body">
          <p className="adl-confirm-dialog__message">{message}</p>
        </div>
        <div className="adl-confirm-dialog__footer">
          <button type="button" className="adl-btn adl-btn--secondary" onClick={onCancel}>
            {resolvedCancel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`adl-btn${danger ? ' adl-btn--danger' : ' adl-btn--primary'}`}
            onClick={onConfirm}
          >
            {resolvedConfirm}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
