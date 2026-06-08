import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface AddShortcutDialogProps {
  open: boolean;
  mode: 'add' | 'rename';
  t: Record<string, string>;
  initialName?: string;
  onConfirm: (name: string, url: string) => void;
  onCancel: () => void;
}

export function AddShortcutDialog({
  open,
  mode,
  t,
  initialName = '',
  onConfirm,
  onCancel,
}: AddShortcutDialogProps) {
  const [name, setName] = useState(initialName);
  const [url, setUrl] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setUrl('');
      requestAnimationFrame(() => {
        nameRef.current?.focus();
      });
    }
  }, [open, initialName]);

  const handleConfirm = useCallback(() => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    if (mode === 'add') {
      const trimmedUrl = url.trim();
      if (!trimmedUrl) return;
      const finalUrl = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;
      onConfirm(trimmedName, finalUrl);
    } else {
      onConfirm(trimmedName, '');
    }
  }, [name, url, mode, onConfirm]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleConfirm();
      } else if (e.key === 'Escape') {
        onCancel();
      }
    },
    [handleConfirm, onCancel]
  );

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onCancel();
    },
    [onCancel]
  );

  if (!open) return null;

  return createPortal(
    <div className="adl-prompt-modal" onKeyDown={handleKeyDown} onClick={handleBackdrop}>
      <div
        className="adl-prompt-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'add' ? t.browserAddShortcutTitle : t.browserRenameShortcutTitle}
      >
        <div className="adl-prompt-modal__header">
          {mode === 'add' ? t.browserAddShortcutTitle : t.browserRenameShortcutTitle}
          <button
            type="button"
            className="adl-prompt-modal__header-close"
            onClick={onCancel}
            aria-label={t.browserClose}
          >
            ✕
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 0 8px' }}>
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text-secondary)',
                marginBottom: 4,
              }}
            >
              {t.browserShortcutName}
            </div>
            <input
              ref={nameRef}
              className="adl-prompt-modal__input"
              type="text"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
          </div>
          {mode === 'add' && (
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  marginBottom: 4,
                }}
              >
                {t.browserShortcutUrl}
              </div>
              <input
                className="adl-prompt-modal__input"
                type="text"
                value={url}
                onChange={(e) => setUrl(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirm();
                }}
              />
            </div>
          )}
        </div>
        <div className="adl-prompt-modal__actions adl-prompt-modal__actions--fill">
          <button
            type="button"
            className="adl-btn adl-btn--ghost adl-btn--square"
            onClick={onCancel}
          >
            {t.browserCancel}
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--primary adl-btn--square"
            onClick={handleConfirm}
            disabled={!name.trim() || (mode === 'add' && !url.trim())}
          >
            {t.browserAddShortcut}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
