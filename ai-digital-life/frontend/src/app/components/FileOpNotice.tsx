import { AnimatePresence, motion } from 'motion/react';
import { useTCopy, formatT } from '../i18n';
import { renderIcon } from '../../design-system/icons';
import { ToastCard } from './ToastCard';
import type { FileOpNotice, FileConflictChoice } from '../stores/slices/fileOpNoticeSlice';
import { FILE_OP_NOTICE_LIMIT } from '../stores/slices/fileOpNoticeSlice';

interface FileOpNoticeCardProps {
  notice: FileOpNotice;
  onDismiss: (id: string) => void;
  onResolveConflict?: (id: string, choice: FileConflictChoice) => void;
}

function ConflictNoticeCard({ notice, onDismiss, onResolveConflict }: FileOpNoticeCardProps) {
  const { t } = useTCopy();
  const detail = formatT(t, 'fileConflictDetail', { name: notice.name });
  return (
    <ToastCard
      tone="warning"
      icon="alert-circle"
      title={t.fileConflictTitle}
      detail={detail}
      role="alert"
      ariaLive="assertive"
      onDismiss={() => onDismiss(notice.id)}
      actions={
        <>
          <button
            type="button"
            className="toast-card__text-btn toast-card__text-btn--primary"
            onClick={() => onResolveConflict?.(notice.id, 'mine')}
          >
            {t.fileConflictKeepMine}
          </button>
          <button
            type="button"
            className="toast-card__text-btn"
            onClick={() => onResolveConflict?.(notice.id, 'disk')}
          >
            {t.fileConflictUseDisk}
          </button>
          <button
            type="button"
            className="toast-card__text-btn"
            onClick={() => onResolveConflict?.(notice.id, 'later')}
          >
            {t.fileConflictLater}
          </button>
        </>
      }
    />
  );
}

function FileOpNoticeCard({ notice, onDismiss }: FileOpNoticeCardProps) {
  const { t } = useTCopy();
  const isFolder = notice.kind === 'folder';
  const title = isFolder ? t.fileCreateDuplicateFolderTitle : t.fileCreateDuplicateFileTitle;
  const duplicateMessage = formatT(
    t,
    isFolder ? 'fileCreateDuplicateFolder' : 'fileCreateDuplicateFile',
    { name: notice.name },
  );
  const suffixHint = notice.suffixHint
    ? (t.fileCreateDuplicateFileSuffixHint as string)
    : undefined;
  const detail = suffixHint ? `${duplicateMessage}\n${suffixHint}` : duplicateMessage;

  return (
    <ToastCard
      tone="warning"
      icon="alert-circle"
      title={title}
      detail={detail}
      role="status"
      ariaLive="polite"
      onDismiss={() => onDismiss(notice.id)}
    />
  );
}

interface FileOpNoticeContainerProps {
  notices: FileOpNotice[];
  onDismiss: (id: string) => void;
  onResolveConflict?: (id: string, choice: FileConflictChoice) => void;
}

export function FileOpNoticeContainer({ notices, onDismiss, onResolveConflict }: FileOpNoticeContainerProps) {
  const { t } = useTCopy();
  const visible = notices.slice(-FILE_OP_NOTICE_LIMIT);
  const hiddenCount = notices.length - visible.length;
  const hasContent = visible.length > 0;

  return (
    <div
      className="toast-card-region__group"
      role={hasContent ? 'region' : undefined}
      aria-label={hasContent ? t.fileOpNoticeRegionLabel : undefined}
    >
      <AnimatePresence mode="popLayout">
        {visible.map((notice) =>
          notice.kind === 'conflict' ? (
            <ConflictNoticeCard
              key={notice.id}
              notice={notice}
              onDismiss={onDismiss}
              onResolveConflict={onResolveConflict}
            />
          ) : (
            <FileOpNoticeCard key={notice.id} notice={notice} onDismiss={onDismiss} />
          ),
        )}
        {hiddenCount > 0 && (
          <motion.div
            key="file-op-notice-summary"
            className="toast-card toast-card--summary"
            layout
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.15 }}
          >
            <span
              className="toast-card__icon"
              dangerouslySetInnerHTML={{
                __html: renderIcon('info', { size: 'md', decorative: true }).value,
              }}
            />
            <span className="toast-card__summary-text">
              {formatT(t, 'errorsMore', { n: hiddenCount })}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
