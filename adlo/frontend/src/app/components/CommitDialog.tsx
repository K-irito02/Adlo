import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface CommitDialogProps {
  open: boolean;
  title: string;
  messageLabel: string;
  placeholder: string;
  stageAllLabel: string;
  submitLabel: string;
  submittingLabel: string;
  emptyMessage: string;
  cancelLabel: string;
  /** 提交失败原因：在弹窗内展示（toast 会被遮罩压住，不能只靠它）。 */
  error?: string;
  /** 提交中：禁用输入与按钮，避免重复提交。 */
  submitting: boolean;
  onCancel: () => void;
  /** stageAll 为用户在弹窗内的勾选状态（默认 true：暂存全部并提交）。 */
  onSubmit: (message: string, stageAll: boolean) => void;
}

/**
 * 提交弹窗（事项3）：独立多行输入 + 「暂存全部并提交」勾选。
 * Ctrl/Cmd+Enter 提交；Esc 取消（提交中不响应，避免中断在途请求）。
 */
export function CommitDialog({
  open,
  title,
  messageLabel,
  placeholder,
  stageAllLabel,
  submitLabel,
  submittingLabel,
  emptyMessage,
  cancelLabel,
  error,
  submitting,
  onCancel,
  onSubmit,
}: CommitDialogProps) {
  const [message, setMessage] = useState('');
  const [stageAll, setStageAll] = useState(true);
  const [touched, setTouched] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setMessage('');
    setStageAll(true);
    setTouched(false);
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (submitting) {
          return;
        }
        event.stopPropagation();
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key === 'Tab') {
        const dialog = dialogRef.current;
        if (!dialog) {
          return;
        }
        const focusables = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    return () => window.removeEventListener('keydown', handleKeydown, true);
  }, [open, onCancel, submitting]);

  const trimmed = message.trim();
  const invalid = touched && trimmed.length === 0;

  const submit = () => {
    if (submitting) {
      return;
    }
    setTouched(true);
    if (!trimmed) {
      inputRef.current?.focus();
      return;
    }
    onSubmit(trimmed, stageAll);
  };

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="adl-confirm-overlay"
      onClick={() => {
        if (!submitting) {
          onCancel();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={dialogRef}
        className="adl-confirm-dialog adl-commit-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="adl-confirm-dialog__header">
          <h3 className="adl-confirm-dialog__title">{title}</h3>
        </div>
        <div className="adl-confirm-dialog__body">
          <label className="adl-commit-dialog__label" htmlFor="adl-commit-message">
            {messageLabel}
          </label>
          <textarea
            id="adl-commit-message"
            ref={inputRef}
            className="adl-commit-dialog__input"
            rows={4}
            value={message}
            placeholder={placeholder}
            disabled={submitting}
            aria-invalid={invalid ? 'true' : undefined}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                submit();
              }
            }}
          />
          {invalid ? (
            <p className="adl-commit-dialog__error" role="alert">
              {emptyMessage}
            </p>
          ) : null}
          {error ? (
            <p className="adl-commit-dialog__error" role="alert">
              {error}
            </p>
          ) : null}
          <label className="adl-commit-dialog__checkbox">
            <input
              type="checkbox"
              checked={stageAll}
              disabled={submitting}
              onChange={(event) => setStageAll(event.target.checked)}
            />
            <span>{stageAllLabel}</span>
          </label>
        </div>
        <div className="adl-confirm-dialog__footer">
          <button
            type="button"
            className="adl-btn adl-btn--secondary"
            onClick={onCancel}
            disabled={submitting}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--primary"
            onClick={submit}
            disabled={submitting || trimmed.length === 0}
          >
            {submitting ? submittingLabel : submitLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
