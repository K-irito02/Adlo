import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTCopy } from '@i18n/useTCopy';

interface FileCreationDialogProps {
  open: boolean;
  target: 'file' | 'folder';
  value: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  onSubmit: () => Promise<void>;
  onCancel: () => void;
}

function FileCreationDialog({
  open,
  target,
  value,
  inputRef,
  onChange,
  onSubmit,
  onCancel,
}: FileCreationDialogProps) {
  const { t } = useTCopy();
  const [submitting, setSubmitting] = useState(false);
  const isFile = target === 'file';
  const title = (isFile ? t.fileNewFile : t.fileNewFolder) as string;

  const handleSubmit = useCallback(async () => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit();
    } catch (error) {
      // onSubmit（useFileCreation.submitCreate）已对常规失败给出反馈；此处兜底捕获
      // 桥接层抛出的异常，避免 void handleSubmit() 产生未处理 Promise rejection。
      console.error('[FileCreationDialog] handleSubmit failed', error);
    } finally {
      setSubmitting(false);
    }
  }, [submitting, onSubmit]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' && !submitting) {
        void handleSubmit();
      } else if (event.key === 'Escape') {
        onCancel();
      }
    },
    [handleSubmit, submitting, onCancel],
  );

  const handleBackdrop = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === event.currentTarget) {
        onCancel();
      }
    },
    [onCancel],
  );

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="adl-prompt-modal" onKeyDown={handleKeyDown} onClick={handleBackdrop}>
      <div className="adl-prompt-modal__panel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="adl-prompt-modal__header">
          {title}
          <button
            type="button"
            className="adl-prompt-modal__header-close"
            onClick={onCancel}
            aria-label={t.close}
          >
            ✕
          </button>
        </div>
        <input
          ref={inputRef}
          className="adl-prompt-modal__input"
          type="text"
          value={value}
          placeholder={t.fileNewNamePlaceholder as string}
          onChange={(event) => onChange(event.currentTarget.value)}
          disabled={submitting}
        />
        <div className="adl-prompt-modal__actions adl-prompt-modal__actions--fill">
          <button
            type="button"
            className="adl-btn adl-btn--ghost adl-btn--square"
            onClick={onCancel}
            disabled={submitting}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--primary-soft adl-btn--square"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            aria-busy={submitting ? 'true' : undefined}
          >
            {submitting ? t.processing : t.confirm}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export { FileCreationDialog };
export type { FileCreationDialogProps };
