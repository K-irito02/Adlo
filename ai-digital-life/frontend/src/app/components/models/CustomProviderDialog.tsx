import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';
import { IconClose, IconEye, IconEyeOff } from '../../icons';

interface CustomProviderDialogProps {
  onClose: () => void;
}

export function CustomProviderDialog({ onClose }: CustomProviderDialogProps) {
  const { t } = useTCopy();
  const addCustomProvider = useAppStore((s) => s.addCustomProvider);

  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [keyVisible, setKeyVisible] = useState(false);
  const [models, setModels] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = useCallback(async () => {
    if (saving || !name.trim() || !baseUrl.trim()) {
      return;
    }
    setSaving(true);
    try {
      const modelList = models
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);
      await addCustomProvider(name.trim(), baseUrl.trim(), apiKey.trim(), modelList);
    } finally {
      setSaving(false);
    }
    onClose();
  }, [name, baseUrl, apiKey, models, saving, addCustomProvider, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
        void handleAdd();
      }
    },
    [handleAdd, onClose],
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  return createPortal(
    <div className="adl-prompt-modal" onClick={handleOverlayClick} onKeyDown={handleKeyDown}>
      <div
        className="adl-prompt-modal__panel adl-prompt-modal__panel--wide"
        role="dialog"
        aria-modal="true"
        aria-label={t.providerManagerAddCustom}
      >
        <div className="adl-prompt-modal__header">
          {t.providerManagerAddCustom}
          <button
            type="button"
            className="adl-prompt-modal__header-close"
            onClick={onClose}
            aria-label={t.providerCancel}
          >
            <IconClose size={14} decorative />
          </button>
        </div>

        <div className="adl-prompt-modal__body">
          <label className="adl-prompt-modal__field">
            <span className="adl-prompt-modal__label">{t.providerManagerCustomName}</span>
            <input
              type="text"
              className="adl-prompt-modal__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.providerCustomNamePlaceholder}
              autoFocus
            />
          </label>

          <label className="adl-prompt-modal__field">
            <span className="adl-prompt-modal__label">{t.providerManagerBaseUrl}</span>
            <input
              type="text"
              className="adl-prompt-modal__input"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={t.providerCustomUrlPlaceholder}
            />
          </label>

          <label className="adl-prompt-modal__field">
            <span className="adl-prompt-modal__label">{t.providerManagerApiKey}</span>
            <span className="adl-prompt-modal__token-input">
              <input
                type={keyVisible ? 'text' : 'password'}
                className="adl-prompt-modal__input adl-prompt-modal__token-field"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={t.providerManagerApiKeyPlaceholder}
              />
              <button
                type="button"
                className="adl-prompt-modal__token-toggle"
                onClick={() => setKeyVisible((v) => !v)}
                title={keyVisible ? t.providerHideKey : t.providerShowKey}
                aria-label={keyVisible ? t.providerHideKey : t.providerShowKey}
              >
                {keyVisible ? (
                  <IconEyeOff size={14} decorative />
                ) : (
                  <IconEye size={14} decorative />
                )}
              </button>
            </span>
          </label>

          <label className="adl-prompt-modal__field">
            <span className="adl-prompt-modal__label">{t.providerManagerCustomModels}</span>
            <input
              type="text"
              className="adl-prompt-modal__input"
              value={models}
              onChange={(e) => setModels(e.target.value)}
              placeholder={t.providerCustomModelsPlaceholder}
            />
          </label>
        </div>

        <div className="adl-prompt-modal__actions adl-prompt-modal__actions--fill">
          <button type="button" className="adl-btn adl-btn--square" onClick={onClose}>
            {t.providerCancel}
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--square"
            onClick={handleAdd}
            disabled={!name.trim() || !baseUrl.trim() || saving}
          >
            {saving ? t.processing : t.providerSave}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
