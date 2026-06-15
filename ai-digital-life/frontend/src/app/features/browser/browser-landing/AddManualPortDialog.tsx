import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface AddManualPortDialogProps {
  open: boolean;
  t: Record<string, string>;
  onConfirm: (port: number, label?: string) => void;
  onCancel: () => void;
}

export function AddManualPortDialog({ open, t, onConfirm, onCancel }: AddManualPortDialogProps) {
  const [port, setPort] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const portRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPort('');
      setLabel('');
      setError('');
      requestAnimationFrame(() => {
        portRef.current?.focus();
      });
    }
  }, [open]);

  /* eslint-disable react-hooks/exhaustive-deps */
  const handleConfirm = useCallback(() => {
    const trimmedPort = port.trim();
    if (!trimmedPort) {
      return;
    }
    const num = Number.parseInt(trimmedPort, 10);
    if (Number.isNaN(num) || num < 1 || num > 65535) {
      setError(t.browserAddPortInvalid || 'Invalid port number (1-65535)');
      return;
    }
    onConfirm(num, label.trim() || undefined);
  }, [port, label, onConfirm]);
  /* eslint-enable react-hooks/exhaustive-deps */

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
      <div
        className="adl-prompt-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={t.browserAddPortTitle}
      >
        <div className="adl-prompt-modal__header">
          {t.browserAddPortTitle}
          <button
            type="button"
            className="adl-prompt-modal__header-close"
            onClick={onCancel}
            aria-label={t.browserClose}
          >
            ✕
          </button>
        </div>
        <div className="adl-prompt-modal__body">
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text-secondary)',
                marginBottom: 4,
              }}
            >
              {t.browserAddPortName}
            </div>
            <input
              className="adl-prompt-modal__input"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.currentTarget.value)}
            />
          </div>
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text-secondary)',
                marginBottom: 4,
              }}
            >
              {t.browserAddPortLabel}
            </div>
            <input
              ref={portRef}
              className="adl-prompt-modal__input"
              type="text"
              value={port}
              onChange={(e) => {
                setPort(e.currentTarget.value);
                if (error) {
                  setError('');
                }
              }}
            />
          </div>
          {error && <p className="adl-prompt-modal__error">{error}</p>}
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
            disabled={!port.trim()}
          >
            {t.browserAddShortcut}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
