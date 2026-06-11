import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface RenameDialogProps {
  open: boolean;
  initialValue: string;
  title?: string;
  placeholder?: string;
  itemInfo?: string;
  onConfirm: (newName: string) => void | Promise<void>;
  onCancel: () => void;
}

export function RenameDialog({
  open,
  initialValue,
  title = '重命名',
  placeholder = '输入新名称',
  itemInfo,
  onConfirm,
  onCancel,
}: RenameDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        setValue(initialValue);
        setLoading(false);
      });
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [open, initialValue]);

  const handleOk = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === initialValue) {
      onCancel();
      return;
    }
    setLoading(true);
    try {
      await onConfirm(trimmed);
    } finally {
      setLoading(false);
    }
  }, [value, initialValue, onConfirm, onCancel]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !loading) {
        void handleOk();
      } else if (e.key === 'Escape') {
        onCancel();
      }
    },
    [handleOk, loading, onCancel]
  );

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onCancel();
      }
    },
    [onCancel]
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
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
        {itemInfo && <div className="adl-prompt-modal__item-info">{itemInfo}</div>}
        <input
          ref={inputRef}
          className="adl-prompt-modal__input"
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.currentTarget.value)}
          disabled={loading}
        />
        <div className="adl-prompt-modal__actions">
          <button
            type="button"
            className="adl-btn adl-btn--ghost adl-btn--square"
            onClick={onCancel}
            disabled={loading}
          >
            取消
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--primary adl-btn--square"
            onClick={() => void handleOk()}
            disabled={loading}
          >
            {loading ? '确认中...' : '确认'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
