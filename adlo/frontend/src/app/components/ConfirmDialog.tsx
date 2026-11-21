import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocusTrap } from '@app/hooks/useDialogFocusTrap';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  /** 执行中：禁用两键，避免重复触发（不可恢复操作尤其需要）。 */
  busy?: boolean;
  /** 确认按钮语义：普通确认 primary / 破坏性 danger / 警告 warning / 成功 success。 */
  tone?: 'primary' | 'danger' | 'warning' | 'success';
  onConfirm: () => void;
  onCancel: () => void;
}

const TONE_CLASS: Record<NonNullable<ConfirmDialogProps['tone']>, string> = {
  primary: 'adl-btn--primary-soft',
  danger: 'adl-btn--danger-soft',
  warning: 'adl-btn--warning-soft',
  success: 'adl-btn--success-soft',
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  busy,
  tone = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useDialogFocusTrap(open, onCancel, confirmRef);

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
          <button
            type="button"
            className="adl-btn adl-btn--neutral-soft"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`adl-btn ${TONE_CLASS[tone]}`}
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy ? 'true' : undefined}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
