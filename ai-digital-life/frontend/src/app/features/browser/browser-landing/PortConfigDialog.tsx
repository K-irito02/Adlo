import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { DEFAULT_CONFIGURED_PORTS } from '@stores/slices/browserSliceShared';
import './PortConfigDialog.css';

interface PortConfigDialogProps {
  open: boolean;
  t: Record<string, string>;
  onClose: () => void;
}

export function PortConfigDialog({ open, t, onClose }: PortConfigDialogProps) {
  const { browserConfiguredPorts, browserSetConfiguredPorts } = useAppStore(
    useShallow((state) => ({
      browserConfiguredPorts: state.browserConfiguredPorts,
      browserSetConfiguredPorts: state.browserSetConfiguredPorts,
    })),
  );

  const [ports, setPorts] = useState<number[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPorts([...browserConfiguredPorts]);
      setInputValue('');
      setError(null);
    }
  }, [open, browserConfiguredPorts]);

  const handleAdd = useCallback(() => {
    const num = Number(inputValue.trim());
    if (!Number.isFinite(num) || num <= 0 || num > 65535) {
      setError(t.browserPortSettingsInvalid);
      return;
    }
    if (ports.includes(num)) {
      setError(t.browserPortSettingsExists);
      return;
    }
    setPorts((prev) => [...prev, num].sort((a, b) => a - b));
    setInputValue('');
    setError(null);
  }, [inputValue, ports, t]);

  const handleRemove = useCallback((port: number) => {
    setPorts((prev) => prev.filter((p) => p !== port));
  }, []);

  const handleReset = useCallback(() => {
    setPorts([...DEFAULT_CONFIGURED_PORTS]);
    setInputValue('');
    setError(null);
  }, []);

  const handleApply = useCallback(() => {
    browserSetConfiguredPorts(ports);
    onClose();
  }, [ports, browserSetConfiguredPorts, onClose]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd],
  );

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="adl-prompt-modal" onKeyDown={handleKeyDown} onClick={handleBackdrop}>
      <div
        className="adl-prompt-modal__panel adl-port-config"
        role="dialog"
        aria-modal="true"
        aria-label={t.browserPortSettings}
      >
        <div className="adl-prompt-modal__header">
          {t.browserPortSettings}
          <button
            type="button"
            className="adl-prompt-modal__header-close"
            onClick={onClose}
            aria-label={t.browserClose}
          >
            ✕
          </button>
        </div>

        <div className="adl-port-config__body">
          <p className="adl-port-config__desc">{t.browserPortSettingsDesc}</p>

          <div className="adl-port-config__input-row">
            <input
              className="adl-port-config__input"
              type="number"
              min={1}
              max={65535}
              step={1}
              placeholder={t.browserPortSettingsPlaceholder}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.currentTarget.value);
                setError(null);
              }}
              onKeyDown={handleInputKeyDown}
            />
            <button
              type="button"
              className="adl-btn adl-btn--primary adl-btn--square"
              onClick={handleAdd}
            >
              {t.browserPortSettingsAdd}
            </button>
          </div>

          {error && <div className="adl-port-config__error">{error}</div>}

          <div className="adl-port-config__list">
            {ports.map((port) => (
              <div key={port} className="adl-port-config__item">
                <span className="adl-port-config__item-port">{port}</span>
                <button
                  type="button"
                  className="adl-port-config__item-remove"
                  onClick={() => handleRemove(port)}
                  aria-label={`${t.browserPortSettingsRemove} ${port}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="adl-port-config__actions adl-prompt-modal__actions--fill">
          <button
            type="button"
            className="adl-btn adl-btn--ghost adl-btn--square"
            onClick={handleReset}
          >
            {t.browserPortSettingsReset}
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--primary adl-btn--square"
            onClick={handleApply}
          >
            {t.browserPortSettingsApply}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
