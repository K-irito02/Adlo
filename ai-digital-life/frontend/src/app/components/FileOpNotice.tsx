import { AnimatePresence, motion } from 'motion/react';
import { useTCopy, formatT } from '../i18n';
import { renderIcon } from '../../design-system/icons';
import { ToastCard } from './ToastCard';
import type { FileOpNotice } from '../stores/slices/fileOpNoticeSlice';
import { FILE_OP_NOTICE_LIMIT } from '../stores/slices/fileOpNoticeSlice';

interface FileOpNoticeCardProps {
  notice: FileOpNotice;
  onDismiss: (id: string) => void;
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
}

export function FileOpNoticeContainer({ notices, onDismiss }: FileOpNoticeContainerProps) {
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
        {visible.map((notice) => (
          <FileOpNoticeCard key={notice.id} notice={notice} onDismiss={onDismiss} />
        ))}
        {hiddenCount > 0 && (
          <motion.div
            key="file-op-notice-summary"
            className="toast-card toast-card--summary"
            layout
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2 }}
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
