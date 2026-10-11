import { forwardRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTCopy, formatT } from '../i18n';
import { renderIcon, type IconName } from '../../design-system/icons';
import { resolveErrorToastLevel, type ErrorToastLevel } from './errorToastLevel';
import type { ErrorToastEntry } from '../stores/slices/errorToastSlice';
import type { CopyKey } from '../i18n/types';
import { ToastCard } from './ToastCard';

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
  const level = resolveErrorToastLevel(entry.code, entry.detail);
  const title =
    level === 'info' ? t.errorsInfo : t[ERROR_TITLE_BY_CODE[entry.code] ?? 'errorsGenericTitle'];

  return (
    <ToastCard
      ref={ref}
      tone={level}
      icon={LEVEL_ICON[level]}
      title={title}
      detail={entry.detail}
      onDismiss={() => onDismiss(entry.id)}
      role={level === 'info' ? 'status' : 'alert'}
      ariaLive={level === 'info' ? 'polite' : 'assertive'}
    />
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
  // 静默记录只进诊断队列，不渲染（Phase 4 审查 S3）。
  const notifyToasts = errorToasts.filter((entry) => !entry.silent);
  const visible = notifyToasts.slice(-ERROR_TOAST_VISIBLE_LIMIT);
  const hiddenCount = notifyToasts.length - visible.length;
  const hasContent = visible.length > 0;

  return (
    <div
      className="toast-card-region__group"
      role={hasContent ? 'region' : undefined}
      aria-label={hasContent ? t.errorsRegionLabel : undefined}
    >
      <AnimatePresence mode="popLayout">
        {visible.map((entry) => (
          <ErrorToast key={entry.id} entry={entry} onDismiss={onDismiss} />
        ))}
        {hiddenCount > 0 && (
          <motion.div
            key="error-toast-summary"
            className="toast-card toast-card--summary"
            layout
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.15 }}
          >
            <span
              className="toast-card__icon"
              dangerouslySetInnerHTML={{ __html: iconHtml('info') }}
            />
            <span className="toast-card__summary-text">
              {formatT(t, 'errorsMore', { n: hiddenCount })}
            </span>
            <button
              type="button"
              className="toast-card__btn"
              onClick={() => {
                onClearAll();
              }}
            >
              {t.errorsClearAll}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
