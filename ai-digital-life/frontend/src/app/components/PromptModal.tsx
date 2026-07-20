import { useEffect, useRef, useState, useCallback } from 'react';
import { useTCopy } from '../i18n/useTCopy';

interface PromptModalProps {
  open: boolean;
  title: string;
  placeholder: string;
  initialValue?: string;
  okLabel: string;
  onOk: (value: string) => string | void | Promise<string | void>;
  onCancel: () => void;
}

export function PromptModal({
  open,
  title,
  placeholder,
  initialValue,
  okLabel,
  onOk,
  onCancel,
}: PromptModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { t } = useTCopy();

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        setValue(initialValue ?? '');
        setLoading(false);
        setError('');
      });
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [open, initialValue]);

  const handleOk = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    setLoading(true);
    setError('');
    try {
      const errMsg = await onOk(trimmed);
      if (errMsg) {
        setError(errMsg);
      }
    } catch {
      setError(t.operationFailed);
    } finally {
      setLoading(false);
    }
  }, [value, onOk, t]);

  const handleValueChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setValue(e.currentTarget.value);
      if (error) {
        setError('');
      }
    },
    [error],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !loading) {
        void handleOk();
      } else if (e.key === 'Escape') {
        onCancel();
      }
    },
    [handleOk, loading, onCancel],
  );

  if (!open) {
    return null;
  }

  return (
    <div className="adl-prompt-modal" onKeyDown={handleKeyDown}>
      <div className="adl-prompt-modal__panel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="adl-prompt-modal__header">{title}</div>
        <input
          ref={inputRef}
          className={`adl-prompt-modal__input${error ? ' adl-prompt-modal__input--error' : ''}`}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={handleValueChange}
          disabled={loading}
        />
        {error ? <p className="adl-prompt-modal__error">{error}</p> : null}
        <div className="adl-prompt-modal__actions">
          <button
            type="button"
            className="adl-btn adl-btn--ghost"
            onClick={onCancel}
            disabled={loading}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--primary"
            onClick={() => void handleOk()}
            disabled={loading || !value.trim()}
          >
            {loading ? t.processing : okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
