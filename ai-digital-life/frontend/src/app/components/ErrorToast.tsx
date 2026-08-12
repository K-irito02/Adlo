import { forwardRef, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useTCopy, copyToClipboard, formatT } from '../i18n';
import { renderIcon, type IconName } from '../../design-system/icons';
import { resolveErrorToastLevel, type ErrorToastLevel } from './errorToastLevel';
import type { ErrorToastEntry } from '../stores/slices/errorToastSlice';
import type { CopyKey } from '../i18n/types';

export const ERROR_TOAST_VISIBLE_LIMIT = 5;

/** error code → i18n 标题 key（未知 code 回退 errorsGenericTitle） */
const ERROR_TITLE_BY_CODE: Record<string, CopyKey> = {
  WORKSPACE_ERROR: 'errorsWorkspace',
  NOT_FOUND: 'errorsNotFound',
  INVALID_INPUT: 'errorsInvalidInput',
  STORAGE_ERROR: 'errorsStorage',
  CONFIG_ERROR: 'errorsConfig',
  IO_ERROR: 'errorsIo',
  MIGRATION_ERROR: 'errorsMigration',
  SECURITY_ERROR: 'errorsSecurity',
  APPROVAL_REQUIRED: 'errorsApproval',
  PATCH_ERROR: 'errorsPatch',
  TERMINAL_ERROR: 'errorsTerminal',
  MODEL_ERROR: 'errorsModel',
  INTERNAL_ERROR: 'errorsInternal',
  NETWORK_ERROR: 'errorsNetwork',
  INVOKE_ERROR: 'errorsInvoke',
  PREVIEW_API_ERROR: 'errorsPreviewApi',
};

function iconHtml(name: IconName, size: 'sm' | 'md' = 'md'): string {
  return renderIcon(name, { size, decorative: true }).value;
}

interface ErrorToastProps {
  entry: ErrorToastEntry;
  onDismiss: (id: string) => void;
}

const LEVEL_ICON: Record<ErrorToastLevel, IconName> = {
  error: 'alert-circle',
  warning: 'alert-circle',
  info: 'info',
};

const ErrorToast = forwardRef<HTMLDivElement, ErrorToastProps>(function ErrorToast(
  { entry, onDismiss },
  ref,
) {
  const { t } = useTCopy();
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimer.current !== null) {
        window.clearTimeout(copiedTimer.current);
      }
    };
  }, []);

  const level = resolveErrorToastLevel(entry.code, entry.detail);
  const title =
    level === 'info' ? t.errorsInfo : t[ERROR_TITLE_BY_CODE[entry.code] ?? 'errorsGenericTitle'];

  const handleCopy = async () => {
    const result = await copyToClipboard(entry.detail);
    if (result.ok) {
      setCopied(true);
      if (copiedTimer.current !== null) {
        window.clearTimeout(copiedTimer.current);
      }
      copiedTimer.current = window.setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <motion.div
      ref={ref}
      className={`error-toast error-toast--${level}${expanded ? ' is-expanded' : ' is-collapsed'}`}
      role={level === 'info' ? 'status' : 'alert'}
      aria-live={level === 'info' ? 'polite' : 'assertive'}
      layout
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ duration: 0.2 }}
    >
      <span
        className="error-toast__icon"
        dangerouslySetInnerHTML={{ __html: iconHtml(LEVEL_ICON[level]) }}
      />
      <div className="error-toast__body">
        <p className="error-toast__title">{title}</p>
        <p className="error-toast__detail">{entry.detail}</p>
      </div>
      <div className="error-toast__actions">
        <button
          type="button"
          className="error-toast__btn"
          aria-label={expanded ? t.errorsCollapse : t.errorsExpand}
          onClick={() => {
            setExpanded((v) => !v);
          }}
          dangerouslySetInnerHTML={{
            __html: iconHtml(expanded ? 'chevron-down' : 'chevron-up', 'sm'),
          }}
        />
        <button
          type="button"
          className="error-toast__btn"
          aria-label={copied ? t.errorsCopied : t.errorsCopy}
          onClick={() => void handleCopy()}
          dangerouslySetInnerHTML={{ __html: iconHtml(copied ? 'check' : 'copy', 'sm') }}
        />
        <button
          type="button"
          className="error-toast__btn"
          aria-label={t.errorsClose}
          onClick={() => {
            onDismiss(entry.id);
          }}
          dangerouslySetInnerHTML={{ __html: iconHtml('close', 'sm') }}
        />
      </div>
    </motion.div>
  );
});

interface ErrorToastContainerProps {
  errorToasts: ErrorToastEntry[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
}

export function ErrorToastContainer({
  errorToasts,
  onDismiss,
  onClearAll,
}: ErrorToastContainerProps) {
  const { t } = useTCopy();
  const visible = errorToasts.slice(-ERROR_TOAST_VISIBLE_LIMIT);
  const hiddenCount = errorToasts.length - visible.length;

  return createPortal(
    <div className="error-toast-region" role="region" aria-label={t.errorsRegionLabel}>
      <AnimatePresence mode="popLayout">
        {visible.map((entry) => (
          <ErrorToast key={entry.id} entry={entry} onDismiss={onDismiss} />
        ))}
        {hiddenCount > 0 && (
          <motion.div
            key="error-toast-summary"
            className="error-toast error-toast--summary"
            layout
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2 }}
          >
            <span
              className="error-toast__icon"
              dangerouslySetInnerHTML={{ __html: iconHtml('info') }}
            />
            <span className="error-toast__summary-text">
              {formatT(t, 'errorsMore', { n: hiddenCount })}
            </span>
            <button
              type="button"
              className="error-toast__btn"
              onClick={() => {
                onClearAll();
              }}
            >
              {t.errorsClearAll}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
