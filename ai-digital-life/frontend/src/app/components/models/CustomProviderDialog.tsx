import React, { useState, useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';
import { IconClose } from '../../icons';

interface CustomProviderDialogProps {
  onClose: () => void;
}

export function CustomProviderDialog({ onClose }: CustomProviderDialogProps) {
  const { t } = useTCopy();
  const addCustomProvider = useAppStore((s) => s.addCustomProvider);

  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = useCallback(async () => {
    if (!name.trim() || !baseUrl.trim()) {
      return;
    }
    setSaving(true);
    const modelList = models
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    await addCustomProvider(name.trim(), baseUrl.trim(), apiKey.trim(), modelList);
    setSaving(false);
    onClose();
  }, [name, baseUrl, apiKey, models, addCustomProvider, onClose]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <div className="adl-dialog-overlay" onClick={handleOverlayClick}>
      <div
        className="adl-dialog adl-custom-provider-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t.providerManagerAddCustom}
      >
        <header className="adl-dialog__header">
          <h3>{t.providerManagerAddCustom}</h3>
          <button
            type="button"
            className="adl-btn adl-btn--ghost adl-btn--xs"
            onClick={onClose}
            aria-label="Close"
          >
            <IconClose size={14} decorative />
          </button>
        </header>

        <div className="adl-dialog__body">
          <label className="adl-custom-provider-dialog__field">
            <span className="adl-custom-provider-dialog__label">{t.providerManagerCustomName}</span>
            <input
              type="text"
              className="adl-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.providerCustomNamePlaceholder}
            />
          </label>

          <label className="adl-custom-provider-dialog__field">
            <span className="adl-custom-provider-dialog__label">{t.providerManagerBaseUrl}</span>
            <input
              type="text"
              className="adl-input"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={t.providerCustomUrlPlaceholder}
            />
          </label>

          <label className="adl-custom-provider-dialog__field">
            <span className="adl-custom-provider-dialog__label">{t.providerManagerApiKey}</span>
            <input
              type="password"
              className="adl-input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t.providerManagerApiKeyPlaceholder}
            />
          </label>

          <label className="adl-custom-provider-dialog__field">
            <span className="adl-custom-provider-dialog__label">
              {t.providerManagerCustomModels}
            </span>
            <input
              type="text"
              className="adl-input"
              value={models}
              onChange={(e) => setModels(e.target.value)}
              placeholder={t.providerCustomModelsPlaceholder}
            />
          </label>
        </div>

        <footer className="adl-dialog__footer">
          <button type="button" className="adl-btn adl-btn--ghost" onClick={onClose}>
            {t.providerCancel}
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--primary"
            onClick={handleAdd}
            disabled={!name.trim() || !baseUrl.trim() || saving}
          >
            {saving ? '...' : t.providerSave}
          </button>
        </footer>
      </div>
    </div>
  );
}
