import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.preventDefault();
        onCancel();
        return;
      }
      // 最小焦点陷阱：Tab / Shift+Tab 在对话框内可聚焦控件间环绕，
      // 兑现 aria-modal 契约（键盘焦点不得逃逸到下层界面）。
      if (event.key === 'Tab') {
        const dialog = dialogRef.current;
        if (!dialog) {
          return;
        }
        const focusables = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusables.length === 0) {
          return;
        }
        event.preventDefault();
        const current = document.activeElement as HTMLElement | null;
        const idx = current ? focusables.indexOf(current) : -1;
        const step = event.shiftKey ? -1 : 1;
        const next =
          idx === -1
            ? event.shiftKey
              ? focusables.length - 1
              : 0
            : (idx + step + focusables.length) % focusables.length;
        focusables[next].focus();
      }
    };
    window.addEventListener('keydown', handleKeydown, true);
    confirmRef.current?.focus();
    return () => window.removeEventListener('keydown', handleKeydown, true);
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
      aria-label={title}
    >
      <div ref={dialogRef} className="adl-confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="adl-confirm-dialog__header">
          <h3 className="adl-confirm-dialog__title">{title}</h3>
        </div>
        <div className="adl-confirm-dialog__body">
          <p className="adl-confirm-dialog__message">{message}</p>
        </div>
        <div className="adl-confirm-dialog__footer">
          <button type="button" className="adl-btn adl-btn--secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="adl-btn adl-btn--danger"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
