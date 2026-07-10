import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import type { CopyDict } from '@i18n/types';
import { IconAlertTriangle, IconClose } from '@icons';
import { CopyButton } from './CopyButton';
import type { NotificationData } from '@stores/slices/notificationSlice';

interface NotificationCardProps {
  notification: NotificationData;
  onClose: (id: string) => void;
  showCopy?: boolean;
}

function formatRelativeTime(ts: number, t: CopyDict): string {
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 0) return '';
  if (seconds < 60) return t.relativeTimeJustNow;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return formatT(t, 'relativeTimeMinutesAgo', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return formatT(t, 'relativeTimeHoursAgo', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return formatT(t, 'relativeTimeDaysAgo', { n: days });
  return formatT(t, 'relativeTimeDaysAgo', { n: Math.floor(days / 30) * 30 });
}

export function NotificationCard({ notification, onClose, showCopy = true }: NotificationCardProps) {
  const { t } = useTCopy();
  const displayTitle = notification.type === 'conflict' ? (t.notifConflictTitle as string) : notification.title;

  return (
    <div className="adl-notif-card" role="alert">
      <div className="adl-notif-card__header">
        <IconAlertTriangle className="adl-notif-card__icon" size={16} />
        <span className="adl-notif-card__title">{displayTitle}</span>
        <button
          type="button"
          className="adl-notif-card__close"
          onClick={() => onClose(notification.id)}
          aria-label={t.notifClose}
        >
          <IconClose size={14} />
        </button>
      </div>
      <div className="adl-notif-card__body">{notification.summary}</div>
      <div className="adl-notif-card__footer">
        <div className="adl-notif-card__footer-left">
          {showCopy && (
            <>
              <span className="adl-notif-card__copy-btn">
                <CopyButton text={notification.fullInfo} size={12} tooltip={t.notifCopyFullInfo as string} />
              </span>
              <span className="adl-notif-card__copy-hint">{t.notifCopyHint as string}</span>
            </>
          )}
        </div>
        <span className="adl-notif-card__time">{formatRelativeTime(notification.timestamp, t)}</span>
      </div>
    </div>
  );
}
