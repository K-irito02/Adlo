import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTCopy } from '@i18n/useTCopy';
import { formatBytes } from '@root/design-system/html';
import { IconAlertTriangle } from '../../icons';
import type { StoragePreflight } from '@shared/ipc/storage';

interface StorageMigrateDialogProps {
  open: boolean;
  /** 迁移预检结果（含总文件数/大小、错误与警告）。 */
  preflight: StoragePreflight | null;
  busy: boolean;
  onCancel: () => void;
  onApply: (retainSource: boolean, applyNow: boolean) => void;
}

/**
 * 迁移时机确认对话框（spec §7.2）：展示预检摘要、错误/警告与「保留旧数据」选择，
 * 由用户决定「立即迁移并重启」还是「下次启动时迁移」。有预检错误时禁用两个迁移按钮。
 */
export function StorageMigrateDialog({
  open,
  preflight,
  busy,
  onCancel,
  onApply,
}: StorageMigrateDialogProps) {
  const { t } = useTCopy();
  const [retainSource, setRetainSource] = useState(false);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      setRetainSource(false);
      return;
    }
    confirmRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  const errors = preflight?.errors ?? [];
  const warnings = preflight?.warnings ?? [];
  const blocked = busy || (preflight !== null && !preflight.ok);

  const summary = t.storageMigrateDialogSummary
    .replace('{files}', String(preflight?.totalFiles ?? 0))
    .replace('{size}', formatBytes(preflight?.totalBytes ?? 0));

  return createPortal(
    <div
      className="adl-confirm-overlay"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={t.storageMigrateDialogTitle}
    >
      <div className="adl-confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="adl-confirm-dialog__header">
          <h3 className="adl-confirm-dialog__title">{t.storageMigrateDialogTitle}</h3>
        </div>
        <div className="adl-confirm-dialog__body">
          <p className="adl-confirm-dialog__message">{summary}</p>

          {errors.length > 0 ? (
            <div className="adl-confirm-dialog__message">
              <p>
                <IconAlertTriangle size={12} decorative /> {t.storagePreflightErrors}
              </p>
              <ul>
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {warnings.length > 0 ? (
            <div className="adl-confirm-dialog__message">
              <p>{t.storagePreflightWarnings}</p>
              <ul>
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <label
            className="adl-confirm-dialog__message"
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
          >
            <input
              type="checkbox"
              checked={retainSource}
              onChange={(e) => setRetainSource(e.target.checked)}
            />
            <span>{t.storageRetainSource}</span>
          </label>
        </div>
        <div className="adl-confirm-dialog__footer">
          <button type="button" className="adl-btn adl-btn--secondary" onClick={onCancel}>
            {t.storageCancel}
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--secondary"
            disabled={blocked}
            onClick={() => onApply(retainSource, false)}
          >
            {t.storageMigrateLater}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="adl-btn adl-btn--primary"
            disabled={blocked}
            onClick={() => onApply(retainSource, true)}
          >
            {t.storageMigrateNow}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
