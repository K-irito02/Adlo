import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from '../../../icons';

interface CreateTabDialogProps {
  open: boolean;
  t: Record<string, string>;
  onConfirm: (name: string, url: string) => void;
  onCancel: () => void;
}

function isValidBrowserUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  const normalized = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    new URL(normalized);
    return true;
  } catch {
    return false;
  }
}

export function CreateTabDialog({ open, t, onConfirm, onCancel }: CreateTabDialogProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setUrl('');
      setUrlError('');
      requestAnimationFrame(() => nameRef.current?.focus());
    }
  }, [open]);

  const handleConfirm = useCallback(() => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    if (!isValidBrowserUrl(trimmedUrl)) {
      setUrlError(t.browserAddPortInvalid);
      return;
    }
    const finalUrl = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;
    onConfirm(trimmedName, finalUrl);
  }, [name, url, onConfirm, t.browserAddPortInvalid]);

  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.currentTarget.value);
    setUrlError('');
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleConfirm();
      else if (e.key === 'Escape') onCancel();
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
        aria-label={t.browserNewTab}
      >
        <div className="adl-prompt-modal__header">
          {t.browserNewTab}
          <button
            type="button"
            className="adl-prompt-modal__header-close"
            onClick={onCancel}
            aria-label={t.browserClose}
          >
            <IconClose size={14} decorative />
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
              {t.browserTabName}
            </div>
            <input
              ref={nameRef}
              className="adl-prompt-modal__input"
              type="text"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder={t.browserTabName}
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
              {t.browserTabUrl}
            </div>
            <input
              className={`adl-prompt-modal__input${urlError ? ' adl-prompt-modal__input--error' : ''}`}
              type="text"
              value={url}
              onChange={handleUrlChange}
              placeholder={t.browserTabUrl}
            />
            {urlError && <p className="adl-prompt-modal__error">{urlError}</p>}
          </div>
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
            disabled={!name.trim() || !url.trim()}
          >
            {t.browserNewTab}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
