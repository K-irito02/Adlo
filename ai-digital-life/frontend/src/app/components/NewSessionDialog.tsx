import { useEffect, useRef, useState, useCallback } from 'react';
import type { CopyDict } from '../i18n';

interface NewSessionDialogProps {
  open: boolean;
  t: CopyDict;
  onCreate: (name: string) => void | Promise<void>;
  onCancel: () => void;
}

export function NewSessionDialog({ open, t, onCreate, onCancel }: NewSessionDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setValue('');
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [open]);

  const handleOk = useCallback(async () => {
    const trimmed = value.trim();
    const name = trimmed || `${t.newSessionDefaultName} ${new Date().toLocaleDateString()}`;
    setLoading(true);
    try {
      await onCreate(name);
    } finally {
      setLoading(false);
    }
  }, [value, t.newSessionDefaultName, onCreate]);

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

  if (!open) {
    return null;
  }

  return (
    <div className="adl-prompt-modal" onKeyDown={handleKeyDown}>
      <div
        className="adl-prompt-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={t.newSessionTitle}
      >
        <div className="adl-prompt-modal__header">{t.newSessionTitle}</div>
        <input
          ref={inputRef}
          className="adl-prompt-modal__input"
          type="text"
          value={value}
          placeholder={t.newSessionPlaceholder}
          onChange={(e) => setValue(e.currentTarget.value)}
          disabled={loading}
        />
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
            disabled={loading}
          >
            {loading ? t.waiting : t.newSessionCreate}
          </button>
        </div>
      </div>
    </div>
  );
}
