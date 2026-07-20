import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { BackgroundMode, BackgroundFit } from '@stores/slices/browserSlice';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import './BackgroundSettingsDialog.css';

interface BackgroundSettingsDialogProps {
  open: boolean;
  t: Record<string, string>;
  onClose: () => void;
}

export function BackgroundSettingsDialog({ open, t, onClose }: BackgroundSettingsDialogProps) {
  const { browserBgConfig, browserSetBgConfig, browserResetBgConfig } = useAppStore(
    useShallow((state) => ({
      browserBgConfig: state.browserBgConfig,
      browserSetBgConfig: state.browserSetBgConfig,
      browserResetBgConfig: state.browserResetBgConfig,
    })),
  );

  const [mode, setMode] = useState<BackgroundMode>(browserBgConfig.mode);
  const [fit, setFit] = useState<BackgroundFit>(browserBgConfig.fit);
  const [filePath, setFilePath] = useState<string | undefined>(browserBgConfig.filePath);
  const [fileName, setFileName] = useState<string | undefined>(browserBgConfig.fileName);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setMode(browserBgConfig.mode);
      setFit(browserBgConfig.fit);
      setFilePath(browserBgConfig.filePath);
      setFileName(browserBgConfig.fileName);
    }
  }, [open, browserBgConfig]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setFilePath(dataUrl);
      setFileName(file.name);
      const isVideo = file.type.startsWith('video/');
      setMode(isVideo ? 'video' : 'image');
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDropZoneClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleApply = useCallback(() => {
    browserSetBgConfig({ mode, fit, filePath, fileName });
    onClose();
  }, [mode, fit, filePath, fileName, browserSetBgConfig, onClose]);

  const handleReset = useCallback(() => {
    browserResetBgConfig();
    setMode('default');
    setFit('cover');
    setFilePath(undefined);
    setFileName(undefined);
    onClose();
  }, [browserResetBgConfig, onClose]);

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

  if (!open) {
    return null;
  }

  const isCustomMode = mode === 'image' || mode === 'video';

  return createPortal(
    <div className="adl-prompt-modal" onKeyDown={handleKeyDown} onClick={handleBackdrop}>
      <div
        className="adl-prompt-modal__panel adl-bg-settings"
        role="dialog"
        aria-modal="true"
        aria-label={t.browserBgSettings}
      >
        <div className="adl-prompt-modal__header">
          {t.browserBgSettings}
          <button
            type="button"
            className="adl-prompt-modal__header-close"
            onClick={onClose}
            aria-label={t.browserClose}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 0 }}>
          <div className="adl-bg-settings__section">
            <label className="adl-bg-settings__label">
              {mode === 'default'
                ? t.browserBgModeDefault
                : mode === 'image'
                  ? t.browserBgModeImage
                  : t.browserBgModeVideo}
            </label>
            <div className="adl-bg-settings__mode-group">
              {(['default', 'image', 'video'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`adl-bg-settings__mode-btn${mode === m ? ' is-active' : ''}`}
                  onClick={() => setMode(m)}
                >
                  {m === 'default'
                    ? t.browserBgModeDefault
                    : m === 'image'
                      ? t.browserBgModeImage
                      : t.browserBgModeVideo}
                </button>
              ))}
            </div>
          </div>

          {isCustomMode && (
            <div className="adl-bg-settings__section">
              <label className="adl-bg-settings__label">{t.browserBgFileTypes}</label>
              <input
                ref={fileInputRef}
                type="file"
                accept={
                  mode === 'video'
                    ? 'video/mp4,video/webm'
                    : 'image/jpeg,image/png,image/gif,image/webp'
                }
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
              {filePath ? (
                <div
                  className="adl-bg-settings__preview"
                  style={{
                    backgroundImage: mode === 'image' ? `url(${filePath})` : undefined,
                    backgroundSize:
                      fit === 'cover' ? 'cover' : fit === 'contain' ? 'contain' : 'auto',
                    backgroundRepeat: fit === 'repeat' ? 'repeat' : 'no-repeat',
                  }}
                >
                  {mode === 'video' && (
                    <video
                      src={filePath}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit:
                          fit === 'cover' ? 'cover' : fit === 'contain' ? 'contain' : 'none',
                      }}
                      autoPlay
                      loop
                      muted
                      playsInline
                    />
                  )}
                </div>
              ) : (
                <div
                  className="adl-bg-settings__upload-zone"
                  onClick={handleDropZoneClick}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleDropZoneClick();
                    }
                  }}
                >
                  <div className="adl-bg-settings__upload-icon">📁</div>
                  <div className="adl-bg-settings__upload-text">{t.browserBgUploadHint}</div>
                  <div className="adl-bg-settings__upload-hint">{t.browserBgFileTypes}</div>
                </div>
              )}
            </div>
          )}

          {isCustomMode && filePath && (
            <div className="adl-bg-settings__section">
              <label className="adl-bg-settings__label">{t.browserBgFillMode}</label>
              <div className="adl-bg-settings__fill-group">
                {(['cover', 'contain', 'repeat'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`adl-bg-settings__fill-btn${fit === f ? ' is-active' : ''}`}
                    onClick={() => setFit(f)}
                  >
                    {f === 'cover'
                      ? t.browserBgFillCover
                      : f === 'contain'
                        ? t.browserBgFillContain
                        : t.browserBgFillRepeat}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="adl-bg-settings__actions adl-prompt-modal__actions--fill">
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--square"
              onClick={handleReset}
            >
              {t.browserBgResetDefault}
            </button>
            <button
              type="button"
              className="adl-btn adl-btn--primary adl-btn--square"
              onClick={handleApply}
            >
              {t.browserBgApply}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
